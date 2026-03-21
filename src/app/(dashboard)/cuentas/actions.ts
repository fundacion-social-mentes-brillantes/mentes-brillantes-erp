'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { calcularEstadoCuenta } from '@/lib/utils/cuentas'
import { requireAdmin } from '@/lib/utils/authz'

export type ActionState = {
  error?: string;
  success?: boolean;
} | null;

export async function saveCuenta(prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase, user
  try {
    ({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const asistente_id = formData.get('asistente_id') as string
  const concepto = formData.get('concepto') as string
  const valor_total_str = formData.get('valor_total') as string
  const fecha_emision = formData.get('fecha_emision') as string
  const abono_inicial_str = formData.get('abono_inicial') as string
  const metodo_pago = formData.get('metodo_pago') as string

  const valor_total = Math.round(parseFloat(valor_total_str))
  const abono_inicial = abono_inicial_str ? Math.round(parseFloat(abono_inicial_str)) : 0

  if (!asistente_id || !concepto || !valor_total_str || !fecha_emision) {
    return { error: 'Todos los campos son obligatorios' }
  }

  if (isNaN(valor_total) || valor_total <= 0) {
    return { error: 'El valor total debe ser mayor a 0' }
  }

  if (abono_inicial < 0) {
    return { error: 'El abono inicial no puede ser negativo' }
  }

  if (abono_inicial > valor_total) {
    return { error: 'El abono inicial no puede ser mayor al valor total' }
  }

  const estado = calcularEstadoCuenta(valor_total, abono_inicial)

  const { data: cuenta, error: cuentaError } = await supabase.from('cuentas_por_cobrar').insert([{
    asistente_id,
    concepto,
    valor_total,
    fecha_emision,
    estado
  }]).select().single()

  if (cuentaError) {
    return { error: cuentaError.message }
  }

  if (abono_inicial > 0 && cuenta) {
    const { error: abonoError } = await supabase.from('pagos_abonos').insert([{
      cuenta_id: cuenta.id,
      monto: abono_inicial,
      metodo_pago: metodo_pago || 'efectivo',
      origen_fondos: 'pago_directo',
      fecha_pago: fecha_emision,
      notas: 'Abono inicial'
    }])

    if (abonoError) {
      return { error: 'Cuenta creada, pero hubo un error al registrar el abono inicial: ' + abonoError.message }
    }
  }

  revalidatePath('/cuentas')
  redirect('/cuentas')
}

export async function deleteCuenta(cuenta_id: string): Promise<ActionState> {
  let supabase, user
  try {
    ({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { error } = await supabase.rpc('rpc_eliminar_cuenta', {
    p_cuenta_id: cuenta_id,
    p_user_id: user.id
  })

  if (error) return { error: error.message }

  revalidatePath('/cuentas')
  redirect('/cuentas')
}

export async function saveAbono(cuenta_id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase
  try {
    ({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const monto_str = formData.get('monto') as string
  const metodo_pago = formData.get('metodo_pago') as string
  const fecha_pago = formData.get('fecha_pago') as string
  const notas = formData.get('notas') as string

  const monto = Math.round(parseFloat(monto_str))

  if (!monto_str || !metodo_pago || !fecha_pago) {
    return { error: 'Monto, método y fecha son obligatorios' }
  }

  if (isNaN(monto) || monto <= 0) {
    return { error: 'El monto debe ser mayor a 0' }
  }

  // Verificar que el abono no supere el saldo pendiente
  const { data: cuentaData } = await supabase
    .from('cuentas_por_cobrar')
    .select('valor_total, pagos_abonos(monto, notas)')
    .eq('id', cuenta_id)
    .single()

  if (cuentaData) {
    const valor_total = Number(cuentaData.valor_total)
    const pagosValidos = cuentaData.pagos_abonos?.filter((p: any) => !p.notas?.includes('[ANULADO]')) || []
    const total_abonado_previo = pagosValidos.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0)
    const monto_pendiente = valor_total - total_abonado_previo

    if (monto > monto_pendiente) {
      return { error: `El abono no puede superar el saldo pendiente ($${monto_pendiente.toLocaleString()})` }
    }
  }

  const { error } = await supabase.from('pagos_abonos').insert([{
    cuenta_id,
    monto,
    metodo_pago,
    origen_fondos: 'pago_directo',
    fecha_pago,
    notas: notas || null
  }])

  if (error) {
    return { error: error.message }
  }

  // Actualizar estado de la cuenta
  if (cuentaData) {
    const valor_total = Number(cuentaData.valor_total)
    const pagosValidos = cuentaData.pagos_abonos?.filter((p: any) => !p.notas?.includes('[ANULADO]')) || []
    const total_abonado_previo = pagosValidos.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0)
    const nuevo_total_abonado = total_abonado_previo + monto
    const nuevo_estado = calcularEstadoCuenta(valor_total, nuevo_total_abonado)

    await supabase.from('cuentas_por_cobrar').update({ estado: nuevo_estado }).eq('id', cuenta_id)
  }

  revalidatePath(`/cuentas/${cuenta_id}`)
  revalidatePath('/cuentas')
  return { success: true }
}

export async function aplicarSaldoFavor(cuenta_id: string, asistente_id: string, maxMontoAplicable: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase
  try {
    ({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const monto = Math.round(parseFloat(formData.get('monto') as string))
  const maxMonto = Math.round(parseFloat(maxMontoAplicable))

  if (isNaN(monto) || monto <= 0) return { error: 'El monto debe ser mayor a 0' }
  if (monto > maxMonto) return { error: `El monto no puede superar $${maxMonto.toLocaleString()}` }

  // Usar RPC para garantizar operación atómica
  const { error } = await supabase.rpc('aplicar_saldo_favor_trx', {
    p_cuenta_id: cuenta_id,
    p_asistente_id: asistente_id,
    p_monto: monto
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/cuentas/${cuenta_id}`)
  revalidatePath(`/asistentes/${asistente_id}`)
  revalidatePath('/cuentas')
  return { success: true }
}

export async function editValorCuenta(cuenta_id: string, valor_anterior: number, prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase, user
  try {
    ({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const valor_nuevo_str = formData.get('valor_nuevo') as string
  const motivo = formData.get('motivo') as string

  if (!valor_nuevo_str || !motivo) return { error: 'Valor y motivo son obligatorios' }

  const valor_nuevo = Math.round(parseFloat(valor_nuevo_str))
  if (isNaN(valor_nuevo) || valor_nuevo <= 0) return { error: 'El valor debe ser mayor a 0' }

  const { error } = await supabase.rpc('rpc_editar_valor_cuenta', {
    p_cuenta_id: cuenta_id,
    p_valor_nuevo: valor_nuevo,
    p_motivo: motivo,
    p_user_id: user.id
  })

  if (error) return { error: error.message }

  revalidatePath(`/cuentas/${cuenta_id}`)
  revalidatePath('/cuentas')
  return { success: true }
}

export async function editMontoAbono(abono_id: string, cuenta_id: string, valor_anterior: number, prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase, user
  try {
    ({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const valor_nuevo_str = formData.get('valor_nuevo') as string
  const motivo = formData.get('motivo') as string

  if (!valor_nuevo_str || !motivo) return { error: 'Valor y motivo son obligatorios' }

  const valor_nuevo = Math.round(parseFloat(valor_nuevo_str))
  if (isNaN(valor_nuevo) || valor_nuevo <= 0) return { error: 'El valor debe ser mayor a 0' }

  const { error } = await supabase.rpc('rpc_editar_monto_abono', {
    p_abono_id: abono_id,
    p_cuenta_id: cuenta_id,
    p_valor_nuevo: valor_nuevo,
    p_motivo: motivo,
    p_user_id: user.id
  })

  if (error) return { error: error.message }

  revalidatePath(`/cuentas/${cuenta_id}`)
  revalidatePath('/cuentas')
  return { success: true }
}
