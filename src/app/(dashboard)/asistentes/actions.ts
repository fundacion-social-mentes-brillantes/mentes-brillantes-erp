'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin, requireRoles } from '@/lib/utils/authz'
import {
  calcularPendienteCuenta,
  calcularSaldoFavorDisponible,
  normalizarCopEntero,
  normalizarCopUsable,
  parseMoneyInput,
} from '@/lib/utils/contable'
import { assertFechaEditable } from '@/lib/utils/periodos'

export type ActionState = {
  error?: string
  success?: boolean
} | null

const notaReversionAnticipo = (anticipoId: string) =>
  `[REVERSO_ANTICIPO:${anticipoId}] Reversion contable de anticipo gestionada desde el perfil del asistente.`

const calcularSaldoDisponible = (
  movimientos: Array<{ tipo?: string | null; monto?: number | string | null }> = []
) => calcularSaldoFavorDisponible(movimientos)

export async function saveAsistente(id: string | null, prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase
  try {
    ;({ supabase } = await requireRoles(['admin', 'caja']))
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const nombre = formData.get('nombre') as string
  const cedula = formData.get('cedula') as string
  const correo = formData.get('correo') as string
  const telefono = formData.get('telefono') as string
  const codigo = formData.get('codigo') as string
  const fecha_registro = (formData.get('fecha_registro') as string) || null
  const fecha_inicio_proceso = (formData.get('fecha_inicio_proceso') as string) || null

  if (!nombre) {
    return { error: 'El nombre es obligatorio' }
  }

  const data = {
    nombre,
    cedula: cedula || null,
    correo: correo || null,
    telefono: telefono || null,
    codigo: codigo || null,
    fecha_registro: fecha_registro || null,
    fecha_inicio_proceso: fecha_inicio_proceso || null,
  }

  if (id) {
    const { error } = await supabase.from('asistentes').update(data).eq('id', id)
    if (error) {
      if (error.code === '23505') return { error: 'Ya existe un asistente con esa cédula o código' }
      return { error: error.message }
    }
  } else {
    const { error } = await supabase.from('asistentes').insert([data])
    if (error) {
      if (error.code === '23505') return { error: 'Ya existe un asistente con esa cédula o código' }
      return { error: error.message }
    }
  }

  revalidatePath('/asistentes')
  redirect('/asistentes')
}

export async function toggleAsistenteEstado(id: string, activo: boolean) {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch {
    return
  }
  await supabase.from('asistentes').update({ activo }).eq('id', id)
  revalidatePath('/asistentes')
}

export async function saveAnticipo(asistente_id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireRoles(['admin', 'caja']))
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const monto = parseMoneyInput(formData.get('monto'))
  const metodo_pago = formData.get('metodo_pago') as string
  const fecha = formData.get('fecha') as string
  const notas = formData.get('notas') as string

  if (monto === null || monto <= 0) return { error: 'El monto debe ser mayor a 0' }
  if (!metodo_pago || !fecha) return { error: 'Método y fecha son obligatorios' }

  const periodoError = await assertFechaEditable(supabase, fecha, 'Registrar el anticipo')
  if (periodoError) return { error: periodoError }

  const { data: anticipoInsertado, error } = await supabase
    .from('movimientos_saldo_favor')
    .insert([
      {
        asistente_id,
        tipo: 'ingreso',
        monto,
        fecha,
        metodo_pago,
        notas: notas || null,
        usuario_id: user?.id || null,
      },
    ])
    .select('id')
    .single()

  if (error) return { error: error.message }

  await supabase.from('auditoria_financiera').insert([
    {
      tabla_afectada: 'movimientos_saldo_favor',
      registro_id: anticipoInsertado.id,
      usuario_id: user?.id || '',
      accion: 'crear_anticipo',
      valor_anterior: null,
      valor_nuevo: monto,
      motivo: notas || 'Registro de anticipo',
    },
  ])

  revalidatePath(`/asistentes/${asistente_id}`)
  return { success: true }
}

export async function revertirAnticipo(asistente_id: string, anticipo_id: string): Promise<ActionState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { data: anticipo, error: anticipoError } = await supabase
    .from('movimientos_saldo_favor')
    .select('id, asistente_id, tipo, monto, fecha, metodo_pago, notas')
    .eq('id', anticipo_id)
    .single()

  if (anticipoError || !anticipo) {
    return { error: 'No se pudo encontrar el anticipo a revertir.' }
  }

  if (anticipo.asistente_id !== asistente_id) {
    return { error: 'El anticipo no pertenece a este asistente.' }
  }

  if (anticipo.tipo !== 'ingreso') {
    return { error: 'Solo se pueden revertir anticipos que representen ingreso real a saldo a favor.' }
  }

  if ((anticipo.notas || '').includes('[ANULADO]')) {
    return { error: 'Este anticipo ya fue revertido anteriormente.' }
  }

  const periodoError = await assertFechaEditable(supabase, anticipo.fecha, 'Revertir el anticipo')
  if (periodoError) return { error: periodoError }

  const { data: movimientosSaldo, error: saldoError } = await supabase
    .from('movimientos_saldo_favor')
    .select('tipo, monto')
    .eq('asistente_id', asistente_id)

  if (saldoError) {
    return { error: 'No se pudo verificar el saldo disponible del asistente.' }
  }

  const saldoDisponible = calcularSaldoDisponible(movimientosSaldo || [])
  const montoAnticipo = normalizarCopUsable(anticipo.monto)

  if (saldoDisponible < montoAnticipo) {
    return {
      error:
        'No se puede revertir este anticipo porque el saldo a favor disponible ya no alcanza. Parte o todo del anticipo ya fue consumido.',
    }
  }

  const notasOriginales = anticipo.notas?.trim() || ''
  const notasAnuladas = `[ANULADO] ${notasOriginales}`.trim()

  const { error: updateError } = await supabase
    .from('movimientos_saldo_favor')
    .update({
      notas: notasAnuladas,
      usuario_id: user?.id || null,
    })
    .eq('id', anticipo_id)

  if (updateError) {
    return { error: updateError.message }
  }

  const { data: reverso, error: reversoError } = await supabase
    .from('movimientos_saldo_favor')
    .insert([
      {
        asistente_id,
        tipo: 'aplicacion',
        monto: montoAnticipo,
        fecha: anticipo.fecha,
        metodo_pago: anticipo.metodo_pago || 'saldo_a_favor',
        notas: notaReversionAnticipo(anticipo_id),
        usuario_id: user?.id || null,
      },
    ])
    .select('id')
    .single()

  if (reversoError || !reverso) {
    await supabase
      .from('movimientos_saldo_favor')
      .update({ notas: anticipo.notas || null })
      .eq('id', anticipo_id)
    return { error: reversoError?.message || 'No se pudo registrar la reversión del anticipo.' }
  }

  const { error: auditError } = await supabase.from('auditoria_financiera').insert([
    {
      tabla_afectada: 'movimientos_saldo_favor',
      registro_id: anticipo_id,
      usuario_id: user?.id || '',
      accion: 'revertir_anticipo',
      valor_anterior: montoAnticipo,
      valor_nuevo: 0,
      motivo: 'Anticipo anulado contablemente desde el perfil del asistente.',
    },
    {
      tabla_afectada: 'movimientos_saldo_favor',
      registro_id: reverso.id,
      usuario_id: user?.id || '',
      accion: 'reversion_anticipo_compensatoria',
      valor_anterior: null,
      valor_nuevo: montoAnticipo,
      motivo: notaReversionAnticipo(anticipo_id),
    },
  ])

  if (auditError) {
    await supabase.from('movimientos_saldo_favor').delete().eq('id', reverso.id)
    await supabase.from('movimientos_saldo_favor').update({ notas: anticipo.notas || null }).eq('id', anticipo_id)
    return { error: auditError.message }
  }

  revalidatePath(`/asistentes/${asistente_id}`)
  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/liquidaciones')
  return { success: true }
}

export async function deleteAsistente(id: string) {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { count: cuentasCount, error: cuentasError } = await supabase
    .from('cuentas_por_cobrar')
    .select('*', { count: 'exact', head: true })
    .eq('asistente_id', id)

  if (cuentasError) {
    return { error: 'Error al verificar relaciones del asistente.' }
  }

  if (cuentasCount && cuentasCount > 0) {
    return {
      error:
        'No se puede eliminar este asistente porque tiene cuentas por cobrar asociadas. Se recomienda desactivarlo en su lugar para mantener el historial.',
    }
  }

  const { error } = await supabase.from('asistentes').delete().eq('id', id)

  if (error) {
    if (error.code === '23503') {
      return { error: 'No se puede eliminar el asistente porque tiene registros financieros o históricos asociados.' }
    }
    return { error: 'Error al eliminar: ' + error.message }
  }

  revalidatePath('/asistentes')
}

export async function pagarDeudasConSaldo(asistente_id: string): Promise<ActionState> {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { data: movimientosSaldo } = await supabase
    .from('movimientos_saldo_favor')
    .select('tipo, monto')
    .eq('asistente_id', asistente_id)
  let saldoDisponible = calcularSaldoDisponible(movimientosSaldo || [])

  if (saldoDisponible <= 0) {
    return { error: 'No hay saldo a favor disponible para aplicar' }
  }

  const fechaHoy = new Date().toISOString().split('T')[0]
  const periodoError = await assertFechaEditable(supabase, fechaHoy, 'Aplicar saldo a favor')
  if (periodoError) {
    return { error: periodoError }
  }

  const { data: cuentas } = await supabase
    .from('cuentas_por_cobrar')
    .select(
      `
      id,
      valor_total,
      fecha_emision,
      pagos_abonos (monto, estado, notas, metodo_pago, origen_fondos)
    `
    )
    .eq('asistente_id', asistente_id)
    .neq('estado', 'pagado')
    .order('fecha_emision', { ascending: true })

  if (!cuentas || cuentas.length === 0) {
    return { error: 'No hay deudas pendientes para pagar' }
  }

  let pagosRealizados = 0

  for (const cuenta of cuentas) {
    if (saldoDisponible <= 0) break

    const pendiente = normalizarCopUsable(
      calcularPendienteCuenta(normalizarCopEntero(cuenta.valor_total), cuenta.pagos_abonos || [])
    )

    if (pendiente <= 0) continue

    const montoAPagar = normalizarCopUsable(Math.min(saldoDisponible, pendiente))
    if (montoAPagar <= 0) continue

    const { error } = await supabase.rpc('aplicar_saldo_favor_trx', {
      p_cuenta_id: cuenta.id,
      p_asistente_id: asistente_id,
      p_monto: montoAPagar,
    })

    if (error) {
      return { error: `Error al pagar cuenta: ${error.message}` }
    }

    saldoDisponible = normalizarCopUsable(saldoDisponible - montoAPagar)
    pagosRealizados++
  }

  if (pagosRealizados === 0) {
    return { error: 'No se procesó ningún pago. Verifica el saldo y las deudas.' }
  }

  revalidatePath(`/asistentes/${asistente_id}`)
  revalidatePath('/cuentas')
  return { success: true }
}

export async function obtenerSiguienteCodigoAsistente(): Promise<number> {
  const supabase = await createClient()
  if (!supabase) return 1

  const { data } = await supabase.from('asistentes').select('codigo')

  if (!data || data.length === 0) return 1

  const codigos = data.map((item) => parseInt(item.codigo)).filter((n) => !isNaN(n))

  const maxCodigo = codigos.length > 0 ? Math.max(...codigos) : 0
  return maxCodigo + 1
}
