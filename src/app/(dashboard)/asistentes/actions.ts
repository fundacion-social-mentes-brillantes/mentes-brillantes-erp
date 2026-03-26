'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin, requireRoles } from '@/lib/utils/authz'

export type ActionState = {
  error?: string
  success?: boolean
} | null

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

  if (!nombre) {
    return { error: 'El nombre es obligatorio' }
  }

  const data = {
    nombre,
    cedula: cedula || null,
    correo: correo || null,
    telefono: telefono || null,
    codigo: codigo || null,
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
  let supabase
  try {
    ;({ supabase } = await requireRoles(['admin', 'caja']))
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const monto = parseFloat(formData.get('monto') as string)
  const metodo_pago = formData.get('metodo_pago') as string
  const fecha = formData.get('fecha') as string
  const notas = formData.get('notas') as string

  if (isNaN(monto) || monto <= 0) return { error: 'El monto debe ser mayor a 0' }
  if (!metodo_pago || !fecha) return { error: 'Método y fecha son obligatorios' }

  const { error } = await supabase.from('movimientos_saldo_favor').insert([
    {
      asistente_id,
      tipo: 'ingreso',
      monto,
      fecha,
      metodo_pago,
      notas: notas || null,
    },
  ])

  if (error) return { error: error.message }

  revalidatePath(`/asistentes/${asistente_id}`)
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

  let totalIngresos = 0
  let totalAplicado = 0

  ;(movimientosSaldo || []).forEach((m) => {
    if (m.tipo === 'ingreso') totalIngresos += Number(m.monto)
    if (m.tipo === 'aplicacion') totalAplicado += Number(m.monto)
  })

  let saldoDisponible = Math.round(totalIngresos - totalAplicado)

  if (saldoDisponible <= 0) {
    return { error: 'No hay saldo a favor disponible para aplicar' }
  }

  const { data: cuentas } = await supabase
    .from('cuentas_por_cobrar')
    .select(
      `
      id,
      valor_total,
      fecha_emision,
      pagos_abonos (monto, notas)
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

    const abonado = Math.round(
      cuenta.pagos_abonos?.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0) || 0
    )
    const pendiente = Math.round(Number(cuenta.valor_total) - abonado)

    if (pendiente <= 0) continue

    const montoAPagar = Math.min(saldoDisponible, pendiente)

    const { error } = await supabase.rpc('aplicar_saldo_favor_trx', {
      p_cuenta_id: cuenta.id,
      p_asistente_id: asistente_id,
      p_monto: montoAPagar,
    })

    if (error) {
      return { error: `Error al pagar cuenta: ${error.message}` }
    }

    saldoDisponible -= montoAPagar
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
