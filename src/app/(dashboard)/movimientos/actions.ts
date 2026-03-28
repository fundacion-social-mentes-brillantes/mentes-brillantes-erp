'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '../../../lib/utils/authz'
import { calcularEstadoCuenta, toSafeNumber, totalPagosValidos } from '@/lib/utils/contable'

export type ActionState = {
  error?: string
  success?: boolean
} | null

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
    case 'aplicacion_saldo':
      tablaDestino = 'pagos_abonos'
      break
    case 'egreso':
      tablaDestino = 'egresos'
      break
    case 'anticipo':
      tablaDestino = 'movimientos_saldo_favor'
      break
    case 'donacion':
      tablaDestino = 'donaciones_asistentes'
      break
    default:
      return { error: 'Tipo de movimiento no soportado para anulación directa.' }
  }

  const { data: recordData } = await supabase
    .from(tablaDestino)
    .select('notas, origen_fondos, metodo_pago')
    .eq('id', movimiento_id)
    .single()

  const currentNotas = recordData?.notas || ''
  const newNotas = `[ANULADO] ${currentNotas}`.trim()

  if (tablaDestino === 'pagos_abonos') {
    const origenFondos = recordData?.origen_fondos?.toLowerCase?.()
    const metodoPago = recordData?.metodo_pago?.toLowerCase?.()
    const esSaldoFavor = origenFondos === 'saldo_a_favor' || metodoPago === 'saldo_a_favor'
    if (esSaldoFavor) {
      return {
        error:
          'No se puede anular este pago porque proviene de saldo a favor. Usa el flujo de devolución de saldo cuando esté disponible.',
      }
    }
  }

  const { error: updateError } = await supabase.from(tablaDestino).update({ estado: 'anulado', notas: newNotas }).eq('id', movimiento_id)

  if (updateError) {
    return { error: updateError.message }
  }

  if (tipo_movimiento === 'aplicacion_saldo' && asistente_id) {
    await supabase.from('movimientos_saldo_favor').insert([
      {
        asistente_id,
        tipo: 'ingreso',
        monto: valor_ingreso,
        fecha: new Date().toISOString().split('T')[0],
        metodo_pago: 'saldo_a_favor',
        notas: `Reversión automática por anulación del movimiento: ${movimiento_id}`,
      },
    ])
  } else if (tipo_movimiento === 'anticipo' && asistente_id) {
    await supabase.from('movimientos_saldo_favor').insert([
      {
        asistente_id,
        tipo: 'aplicacion',
        monto: valor_ingreso,
        fecha: new Date().toISOString().split('T')[0],
        metodo_pago: 'saldo_a_favor',
        notas: `Reversión automática por anulación del anticipo: ${movimiento_id}`,
      },
    ])
  }

  if ((tipo_movimiento === 'abono' || tipo_movimiento === 'aplicacion_saldo') && tablaDestino === 'pagos_abonos') {
    const { data: pago } = await supabase.from('pagos_abonos').select('cuenta_id').eq('id', movimiento_id).single()
    if (pago?.cuenta_id) {
      const { data: cuentaData } = await supabase
        .from('cuentas_por_cobrar')
        .select('valor_total, pagos_abonos(id, monto, estado, notas, metodo_pago, origen_fondos, tipo)')
        .eq('id', pago.cuenta_id)
        .single()

      if (cuentaData) {
        const total_abonado = totalPagosValidos(cuentaData.pagos_abonos || [])
        const valor_total = toSafeNumber(cuentaData.valor_total)
        const nuevo_estado = calcularEstadoCuenta(valor_total, total_abonado)
        await supabase.from('cuentas_por_cobrar').update({ estado: nuevo_estado }).eq('id', pago.cuenta_id)
      }
    }
  }

  await supabase.from('auditoria_financiera').insert([
    {
      tabla_afectada: tablaDestino,
      registro_id: movimiento_id,
      usuario_id: user.id,
      accion: 'anulacion_movimiento',
      valor_anterior: valor_ingreso,
      valor_nuevo: 0,
      motivo: 'Anulación solicitada por el administrador via interfaz.',
    },
  ])

  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/asistentes')
  if (tipo_movimiento === 'abono' || tipo_movimiento === 'aplicacion_saldo') {
    revalidatePath('/cuentas')
  }

  return { success: true }
}

export async function editarMovimiento(
  movimiento_id: string,
  tipo_movimiento: string,
  newData: any
): Promise<ActionState> {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  let tablaDestino = ''
  const updatePayload: any = {}

  if (newData.monto !== undefined) updatePayload.monto = newData.monto
  if (newData.notas !== undefined) updatePayload.notas = newData.notas
  if (newData.concepto !== undefined) updatePayload.concepto = newData.concepto
  if (newData.asistente_id !== undefined) updatePayload.asistente_id = newData.asistente_id
  if (newData.categoria !== undefined) updatePayload.categoria = newData.categoria

  switch (tipo_movimiento) {
    case 'abono':
    case 'aplicacion_saldo':
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
      return { error: 'Tipo de movimiento no soportado para edición.' }
  }

  const { error: updateError } = await supabase.from(tablaDestino).update(updatePayload).eq('id', movimiento_id)
  if (updateError) return { error: updateError.message }

  // Recalcular estado de cuenta si es abono o aplicación de saldo
  if ((tipo_movimiento === 'abono' || tipo_movimiento === 'aplicacion_saldo') && tablaDestino === 'pagos_abonos') {
    const { data: pago } = await supabase.from('pagos_abonos').select('cuenta_id').eq('id', movimiento_id).single()
    const cuentaId = pago?.cuenta_id
    if (cuentaId) {
      const { data: cuentaData } = await supabase
        .from('cuentas_por_cobrar')
        .select('valor_total, pagos_abonos(id, monto, estado, notas)')
        .eq('id', cuentaId)
        .single()

      if (cuentaData) {
        const pagosValidos =
          cuentaData.pagos_abonos?.filter(
            (p: any) => p.estado !== 'anulado' && !p.notas?.includes('[ANULADO]')
          ) || []
        const total_abonado = pagosValidos.reduce((sum: number, p: any) => sum + Number(p.monto), 0)
        const valor_total = Number(cuentaData.valor_total)
        let nuevo_estado = 'pendiente'
        if (total_abonado >= valor_total) {
          nuevo_estado = 'pagado'
        } else if (total_abonado > 0) {
          nuevo_estado = 'parcial'
        }
        await supabase.from('cuentas_por_cobrar').update({ estado: nuevo_estado }).eq('id', cuentaId)
      }
    }
  }

  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/asistentes')
  if (tipo_movimiento === 'abono' || tipo_movimiento === 'aplicacion_saldo') {
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
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  let tablaDestino = ''
  switch (tipo_movimiento) {
    case 'abono':
    case 'aplicacion_saldo':
      tablaDestino = 'pagos_abonos'
      break
    case 'egreso':
      tablaDestino = 'egresos'
      break
    case 'anticipo':
      tablaDestino = 'movimientos_saldo_favor'
      break
    case 'donacion':
      tablaDestino = 'donaciones_asistentes'
      break
    default:
      return { error: 'Tipo de movimiento no soportado para el borrado duro.' }
  }

  if (tipo_movimiento === 'aplicacion_saldo' && asistente_id) {
    await supabase.from('movimientos_saldo_favor').insert([
      {
        asistente_id,
        tipo: 'ingreso',
        monto: valor_ingreso,
        fecha: new Date().toISOString().split('T')[0],
        metodo_pago: 'saldo_a_favor',
        notas: `Reversión automática por ELIMINACIÓN del movimiento: ${movimiento_id}`,
      },
    ])
  } else if (tipo_movimiento === 'anticipo' && asistente_id) {
    await supabase.from('movimientos_saldo_favor').insert([
      {
        asistente_id,
        tipo: 'aplicacion',
        monto: valor_ingreso,
        fecha: new Date().toISOString().split('T')[0],
        metodo_pago: 'saldo_a_favor',
        notas: `Reversión automática por ELIMINACIÓN del anticipo: ${movimiento_id}`,
      },
    ])
  }

  let cuentaToRecalculate: string | null = null
  if ((tipo_movimiento === 'abono' || tipo_movimiento === 'aplicacion_saldo') && tablaDestino === 'pagos_abonos') {
    const { data: pago } = await supabase.from('pagos_abonos').select('cuenta_id').eq('id', movimiento_id).single()
    cuentaToRecalculate = pago?.cuenta_id || null
  }

  const { error: deleteError } = await supabase.from(tablaDestino).delete().eq('id', movimiento_id)

  if (deleteError) {
    return { error: deleteError.message }
  }

  if (cuentaToRecalculate) {
    const { data: cuentaData } = await supabase
      .from('cuentas_por_cobrar')
      .select('valor_total, pagos_abonos(id, monto, estado, notas, metodo_pago, origen_fondos, tipo)')
      .eq('id', cuentaToRecalculate)
      .single()

    if (cuentaData) {
      const total_abonado = totalPagosValidos(cuentaData.pagos_abonos || [])
      const valor_total = toSafeNumber(cuentaData.valor_total)
      const nuevo_estado = calcularEstadoCuenta(valor_total, total_abonado)

      await supabase.from('cuentas_por_cobrar').update({ estado: nuevo_estado }).eq('id', cuentaToRecalculate)
    }
  }

  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/asistentes')
  if (tipo_movimiento === 'abono' || tipo_movimiento === 'aplicacion_saldo') {
    revalidatePath('/cuentas')
  }

  return { success: true }
}
