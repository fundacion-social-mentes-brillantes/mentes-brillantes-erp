'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '../../../lib/utils/authz'
import { calcularEstadoCuenta, toSafeNumber, totalPagosValidos } from '@/lib/utils/contable'
import { assertFechaEditable } from '@/lib/utils/periodos'

export type ActionState = {
  error?: string
  success?: boolean
} | null

const APLICACION_SALDO_BLOQUEADA =
  'Las aplicaciones de saldo a favor no se pueden editar, anular ni eliminar desde Historial General. Deben gestionarse desde un flujo transaccional dedicado para no desbalancear la cuenta ni el saldo.'
const ANTICIPO_BLOQUEADO =
  'Los anticipos/saldo a favor no se pueden anular ni eliminar desde Historial General. Deben gestionarse desde un flujo contable dedicado para no desbalancear períodos ni saldo a favor.'
const EDICION_ABONO_BLOQUEADA =
  'El monto de un abono no se puede editar desde Historial General. Usa el detalle de la cuenta para preservar correctamente sobrepagos y saldo a favor.'
const ABONO_CON_SALDO_BLOQUEADO =
  'Este abono genero movimientos de saldo a favor por sobrepago. Debe gestionarse desde el detalle de la cuenta para no duplicar ni perder dinero.'

async function hasSaldoFavorAsociadoAbono(supabase: any, cuentaId: string | null | undefined, abonoId: string) {
  if (!cuentaId) return false

  const { data, error } = await supabase
    .from('movimientos_saldo_favor')
    .select('id')
    .eq('cuenta_id', cuentaId)
    .ilike('notas', `%[ABONO:${abonoId}]%`)

  if (error) {
    return false
  }

  return (data || []).length > 0
}

async function getMovimientoEditableMeta(supabase: any, tipoMovimiento: string, movimientoId: string) {
  switch (tipoMovimiento) {
    case 'abono': {
      const { data, error } = await supabase
        .from('pagos_abonos')
        .select('cuenta_id, fecha_pago, notas, origen_fondos, metodo_pago')
        .eq('id', movimientoId)
        .single()
      return { data, error, fecha: data?.fecha_pago, tabla: 'pagos_abonos' }
    }
    case 'egreso': {
      const { data, error } = await supabase.from('egresos').select('fecha, notas').eq('id', movimientoId).single()
      return { data, error, fecha: data?.fecha, tabla: 'egresos' }
    }
    case 'anticipo': {
      const { data, error } = await supabase
        .from('movimientos_saldo_favor')
        .select('fecha, notas')
        .eq('id', movimientoId)
        .single()
      return { data, error, fecha: data?.fecha, tabla: 'movimientos_saldo_favor' }
    }
    case 'donacion': {
      const { data, error } = await supabase
        .from('donaciones_asistentes')
        .select('fecha, notas')
        .eq('id', movimientoId)
        .single()
      return { data, error, fecha: data?.fecha, tabla: 'donaciones_asistentes' }
    }
    default:
      return { data: null, error: null, fecha: null, tabla: null }
  }
}

async function recalcularEstadoCuenta(supabase: any, cuentaId: string | null | undefined) {
  if (!cuentaId) return

  const { data: cuentaData } = await supabase
    .from('cuentas_por_cobrar')
    .select('valor_total, pagos_abonos(id, monto, estado, notas, metodo_pago, origen_fondos, tipo)')
    .eq('id', cuentaId)
    .single()

  if (!cuentaData) return

  const total_abonado = totalPagosValidos(cuentaData.pagos_abonos || [])
  const valor_total = toSafeNumber(cuentaData.valor_total)
  const nuevo_estado = calcularEstadoCuenta(valor_total, total_abonado)
  await supabase.from('cuentas_por_cobrar').update({ estado: nuevo_estado }).eq('id', cuentaId)
}

export async function anularMovimiento(
  movimiento_id: string,
  tipo_movimiento: string,
  valor_ingreso: number,
  asistente_id: string | null
): Promise<ActionState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  let tablaDestino = ''
  switch (tipo_movimiento) {
    case 'abono':
      tablaDestino = 'pagos_abonos'
      break
    case 'aplicacion_saldo':
      return { error: APLICACION_SALDO_BLOQUEADA }
    case 'egreso':
      tablaDestino = 'egresos'
      break
    case 'anticipo':
      return { error: ANTICIPO_BLOQUEADO }
    case 'donacion':
      tablaDestino = 'donaciones_asistentes'
      break
    default:
      return { error: 'Tipo de movimiento no soportado para anulacion directa.' }
  }

  const { data: recordData, error: recordError, fecha } = await getMovimientoEditableMeta(supabase, tipo_movimiento, movimiento_id)
  if (recordError || !recordData) {
    return { error: 'No se pudo consultar el movimiento a anular.' }
  }

  const periodoError = await assertFechaEditable(supabase, fecha, 'Anular el movimiento')
  if (periodoError) return { error: periodoError }

  const currentNotas = recordData?.notas || ''
  const newNotas = `[ANULADO] ${currentNotas}`.trim()

  if (tablaDestino === 'pagos_abonos') {
    const origenFondos = recordData?.origen_fondos?.toLowerCase?.()
    const metodoPago = recordData?.metodo_pago?.toLowerCase?.()
    const esSaldoFavor = origenFondos === 'saldo_a_favor' || metodoPago === 'saldo_a_favor'
    if (esSaldoFavor) {
      return {
        error:
          'No se puede anular este pago porque proviene de saldo a favor. Usa el flujo de devolucion de saldo cuando este disponible.',
      }
    }

    const tieneSaldoAsociado = await hasSaldoFavorAsociadoAbono(supabase, recordData?.cuenta_id, movimiento_id)
    if (tieneSaldoAsociado) {
      return { error: ABONO_CON_SALDO_BLOQUEADO }
    }
  }

  const { error: updateError } = await supabase.from(tablaDestino).update({ estado: 'anulado', notas: newNotas }).eq('id', movimiento_id)
  if (updateError) {
    return { error: updateError.message }
  }

  if (tipo_movimiento === 'abono' && tablaDestino === 'pagos_abonos') {
    const { data: pago } = await supabase.from('pagos_abonos').select('cuenta_id').eq('id', movimiento_id).single()
    await recalcularEstadoCuenta(supabase, pago?.cuenta_id)
  }

  await supabase.from('auditoria_financiera').insert([
    {
      tabla_afectada: tablaDestino,
      registro_id: movimiento_id,
      usuario_id: user.id,
      accion: 'anulacion_movimiento',
      valor_anterior: valor_ingreso,
      valor_nuevo: 0,
      motivo: 'Anulacion solicitada por el administrador via interfaz.',
    },
  ])

  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/asistentes')
  if (tipo_movimiento === 'abono') {
    revalidatePath('/cuentas')
  }

  return { success: true }
}

export async function editarMovimiento(
  movimiento_id: string,
  tipo_movimiento: string,
  newData: any
): Promise<ActionState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  if (tipo_movimiento === 'aplicacion_saldo') {
    return { error: APLICACION_SALDO_BLOQUEADA }
  }

  if (tipo_movimiento === 'abono' && newData.monto !== undefined) {
    return { error: EDICION_ABONO_BLOQUEADA }
  }

  const { data: recordData, error: recordError, fecha } = await getMovimientoEditableMeta(supabase, tipo_movimiento, movimiento_id)
  if (recordError || !recordData) {
    return { error: 'No se pudo consultar el movimiento a editar.' }
  }

  if (tipo_movimiento === 'abono') {
    const tieneSaldoAsociado = await hasSaldoFavorAsociadoAbono(supabase, recordData?.cuenta_id, movimiento_id)
    if (tieneSaldoAsociado) {
      return { error: ABONO_CON_SALDO_BLOQUEADO }
    }
  }

  const periodoActualError = await assertFechaEditable(supabase, fecha, 'Editar el movimiento')
  if (periodoActualError) return { error: periodoActualError }

  let tablaDestino = ''
  const updatePayload: any = {}

  if (newData.monto !== undefined) updatePayload.monto = newData.monto
  if (newData.notas !== undefined) updatePayload.notas = newData.notas
  if (newData.concepto !== undefined) updatePayload.concepto = newData.concepto
  if (newData.asistente_id !== undefined) updatePayload.asistente_id = newData.asistente_id
  if (newData.categoria !== undefined) updatePayload.categoria = newData.categoria

  switch (tipo_movimiento) {
    case 'abono':
      tablaDestino = 'pagos_abonos'
      if (newData.fecha !== undefined) updatePayload.fecha_pago = newData.fecha
      if (newData.metodo_pago !== undefined) updatePayload.metodo_pago = newData.metodo_pago
      delete updatePayload.asistente_id
      delete updatePayload.concepto
      delete updatePayload.categoria
      break
    case 'egreso':
      tablaDestino = 'egresos'
      if (newData.fecha !== undefined) updatePayload.fecha = newData.fecha
      if (newData.metodo_pago !== undefined) updatePayload.metodo_pago = newData.metodo_pago
      delete updatePayload.asistente_id
      break
    case 'anticipo':
      tablaDestino = 'movimientos_saldo_favor'
      if (newData.fecha !== undefined) updatePayload.fecha = newData.fecha
      if (newData.metodo_pago !== undefined) updatePayload.metodo_pago = newData.metodo_pago
      delete updatePayload.concepto
      delete updatePayload.categoria
      break
    case 'donacion':
      tablaDestino = 'donaciones_asistentes'
      if (newData.fecha !== undefined) updatePayload.fecha = newData.fecha
      if (newData.metodo_pago !== undefined) updatePayload.metodo_pago = newData.metodo_pago
      if (newData.asistente_id !== undefined) updatePayload.asistente_id = newData.asistente_id
      delete updatePayload.concepto
      delete updatePayload.categoria
      break
    default:
      return { error: 'Tipo de movimiento no soportado para edicion.' }
  }

  const nuevaFecha =
    tipo_movimiento === 'abono'
      ? updatePayload.fecha_pago
      : tipo_movimiento === 'egreso' || tipo_movimiento === 'anticipo' || tipo_movimiento === 'donacion'
        ? updatePayload.fecha
        : null

  if (nuevaFecha) {
    const periodoNuevoError = await assertFechaEditable(supabase, nuevaFecha, 'Editar el movimiento')
    if (periodoNuevoError) return { error: periodoNuevoError }
  }

  const { error: updateError } = await supabase.from(tablaDestino).update(updatePayload).eq('id', movimiento_id)
  if (updateError) return { error: updateError.message }

  if (tipo_movimiento === 'abono' && tablaDestino === 'pagos_abonos') {
    const { data: pago } = await supabase.from('pagos_abonos').select('cuenta_id').eq('id', movimiento_id).single()
    await recalcularEstadoCuenta(supabase, pago?.cuenta_id)
  }

  await supabase.from('auditoria_financiera').insert([
    {
      tabla_afectada: tablaDestino,
      registro_id: movimiento_id,
      usuario_id: user.id,
      accion: 'edicion_movimiento',
      valor_anterior: null,
      valor_nuevo: toSafeNumber(updatePayload.monto),
      motivo: 'Edicion solicitada por el administrador via historial general.',
    },
  ])

  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/asistentes')
  if (tipo_movimiento === 'abono') {
    revalidatePath('/cuentas')
  }

  return { success: true }
}

export async function eliminarMovimiento(
  movimiento_id: string,
  tipo_movimiento: string,
  valor_ingreso: number,
  asistente_id: string | null
): Promise<ActionState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  if (tipo_movimiento === 'aplicacion_saldo') {
    return { error: APLICACION_SALDO_BLOQUEADA }
  }

  let tablaDestino = ''
  switch (tipo_movimiento) {
    case 'abono':
      tablaDestino = 'pagos_abonos'
      break
    case 'egreso':
      tablaDestino = 'egresos'
      break
    case 'anticipo':
      return { error: ANTICIPO_BLOQUEADO }
    case 'donacion':
      tablaDestino = 'donaciones_asistentes'
      break
    default:
      return { error: 'Tipo de movimiento no soportado para el borrado duro.' }
  }

  const { data: recordData, error: recordError, fecha } = await getMovimientoEditableMeta(supabase, tipo_movimiento, movimiento_id)
  if (recordError || !recordData) {
    return { error: 'No se pudo consultar el movimiento a eliminar.' }
  }

  const periodoError = await assertFechaEditable(supabase, fecha, 'Eliminar el movimiento')
  if (periodoError) return { error: periodoError }

  if (tablaDestino === 'pagos_abonos') {
    const tieneSaldoAsociado = await hasSaldoFavorAsociadoAbono(supabase, recordData?.cuenta_id, movimiento_id)
    if (tieneSaldoAsociado) {
      return { error: ABONO_CON_SALDO_BLOQUEADO }
    }
  }

  let cuentaToRecalculate: string | null = null
  if (tipo_movimiento === 'abono' && tablaDestino === 'pagos_abonos') {
    const { data: pago } = await supabase.from('pagos_abonos').select('cuenta_id').eq('id', movimiento_id).single()
    cuentaToRecalculate = pago?.cuenta_id || null
  }

  const { error: deleteError } = await supabase.from(tablaDestino).delete().eq('id', movimiento_id)
  if (deleteError) {
    return { error: deleteError.message }
  }

  if (cuentaToRecalculate) {
    await recalcularEstadoCuenta(supabase, cuentaToRecalculate)
  }

  await supabase.from('auditoria_financiera').insert([
    {
      tabla_afectada: tablaDestino,
      registro_id: movimiento_id,
      usuario_id: user.id,
      accion: 'eliminar_movimiento',
      valor_anterior: valor_ingreso,
      valor_nuevo: null,
      motivo: 'Eliminacion definitiva solicitada por el administrador via historial general.',
    },
  ])

  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/asistentes')
  if (tipo_movimiento === 'abono') {
    revalidatePath('/cuentas')
  }

  return { success: true }
}
