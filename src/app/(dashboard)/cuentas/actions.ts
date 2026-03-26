'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { calcularEstadoCuenta } from '../../../lib/utils/cuentas'
import { requireAdmin, requireRoles } from '../../../lib/utils/authz'

export type ActionState = {
  error?: string
  success?: boolean
} | null

export async function saveCuenta(prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireRoles(['admin', 'caja']))
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const asistente_id = formData.get('asistente_id') as string
  const concepto = (formData.get('concepto') as string) || ''
  const valor_total_str = formData.get('valor_total') as string
  const fecha_emision = formData.get('fecha_emision') as string
  const abono_inicial_str = formData.get('abono_inicial') as string
  const metodo_pago = formData.get('metodo_pago') as string
  const tipo_cuenta = ((formData.get('tipo_cuenta') as string) || 'general').toLowerCase()
  const sesiones_coach_str = formData.get('sesiones_coach') as string | null
  const fecha_sesion_coach_raw = formData.get('fecha_sesion_coach') as string | null

  const valor_total = Math.round(parseFloat(valor_total_str))
  const abono_inicial = abono_inicial_str ? Math.round(parseFloat(abono_inicial_str)) : 0
  const sesiones_coach = sesiones_coach_str ? parseInt(sesiones_coach_str, 10) : null
  const fecha_sesion_coach =
    fecha_sesion_coach_raw && fecha_sesion_coach_raw.trim() !== '' ? fecha_sesion_coach_raw : null

  if (!asistente_id || !valor_total_str || !fecha_emision) {
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

  if (tipo_cuenta === 'coach') {
    if (!sesiones_coach || isNaN(sesiones_coach) || sesiones_coach <= 0) {
      return { error: 'Debes indicar cuántas sesiones compradas (mayor a 0)' }
    }
    if (fecha_sesion_coach && isNaN(Date.parse(fecha_sesion_coach))) {
      return { error: 'La fecha de la sesión coach no es válida' }
    }
  }

  const estado = calcularEstadoCuenta(valor_total, abono_inicial)

  const conceptoFinal =
    tipo_cuenta === 'coach' && concepto.trim().length === 0
      ? `Sesión guía coach - ${sesiones_coach} sesiones`
      : concepto

  const { data: cuenta, error: cuentaError } = await supabase
    .from('cuentas_por_cobrar')
    .insert([
      {
        asistente_id,
        concepto: conceptoFinal,
        valor_total,
        fecha_emision,
        estado,
      },
    ])
    .select()
    .single()

  if (cuentaError) {
    return { error: cuentaError.message }
  }

  if (abono_inicial > 0 && cuenta) {
    const { error: abonoError } = await supabase.from('pagos_abonos').insert([
      {
        cuenta_id: cuenta.id,
        monto: abono_inicial,
        metodo_pago: metodo_pago || 'efectivo',
        origen_fondos: 'pago_directo',
        fecha_pago: fecha_emision,
        notas: 'Abono inicial',
      },
    ])

    if (abonoError) {
      return { error: 'Cuenta creada, pero hubo un error al registrar el abono inicial: ' + abonoError.message }
    }
  }

  if (tipo_cuenta === 'coach' && cuenta) {
    const { data: paquete, error: coachError } = await supabase
      .from('coach_paquetes')
      .insert([
        {
          cuenta_id: cuenta.id,
          asistente_id,
          sesiones_compradas: sesiones_coach,
        },
      ])
      .select()
      .single()
    if (coachError) {
      return { error: 'Cuenta creada, pero error creando paquete coach: ' + coachError.message }
    }

    if (paquete && fecha_sesion_coach && (sesiones_coach ?? 0) > 0) {
      const { error: sesionError } = await supabase.from('coach_sesiones').insert([
        {
          paquete_id: paquete.id,
          asistente_id,
          fecha: fecha_sesion_coach,
          notas: null,
        },
      ])

      if (sesionError) {
        return {
          error: 'Cuenta y paquete creados, pero no se pudo registrar la sesión coach: ' + sesionError.message,
        }
      }
    }
  }

  revalidatePath('/cuentas')
  if (cuenta?.id) {
    revalidatePath(`/cuentas/${cuenta.id}`)
  }
  if (asistente_id) {
    revalidatePath(`/asistentes/${asistente_id}`)
  }
  redirect('/cuentas')
}

export async function deleteCuenta(cuenta_id: string): Promise<ActionState> {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { count: pagosCount, error: pagosError } = await supabase
    .from('pagos_abonos')
    .select('*', { count: 'exact', head: true })
    .eq('cuenta_id', cuenta_id)

  if (pagosError) return { error: pagosError.message }
  if ((pagosCount ?? 0) > 0) {
    return { error: 'No se puede eliminar la cuenta porque tiene pagos registrados. Anula o elimina los pagos primero.' }
  }

  const { data: paquete } = await supabase.from('coach_paquetes').select('id').eq('cuenta_id', cuenta_id).single()

  if (paquete) {
    const { count: sesionesCount } = await supabase
      .from('coach_sesiones')
      .select('*', { count: 'exact', head: true })
      .eq('paquete_id', paquete.id)
    if ((sesionesCount ?? 0) > 0) {
      return { error: 'No se puede eliminar la cuenta porque tiene sesiones coach registradas.' }
    }
  }

  const { error: deleteError } = await supabase.from('cuentas_por_cobrar').delete().eq('id', cuenta_id)

  if (deleteError) return { error: deleteError.message }

  revalidatePath('/cuentas')
  redirect('/cuentas')
}

export async function saveAbono(cuenta_id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase
  try {
    ;({ supabase } = await requireRoles(['admin', 'caja']))
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

  const { error } = await supabase.from('pagos_abonos').insert([
    {
      cuenta_id,
      monto,
      metodo_pago,
      origen_fondos: 'pago_directo',
      fecha_pago,
      notas: notas || null,
    },
  ])

  if (error) {
    return { error: error.message }
  }

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

export async function aplicarSaldoFavor(
  cuenta_id: string,
  asistente_id: string,
  maxMontoAplicable: string,
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const monto = Math.round(parseFloat(formData.get('monto') as string))
  const maxMonto = Math.round(parseFloat(maxMontoAplicable))

  if (isNaN(monto) || monto <= 0) return { error: 'El monto debe ser mayor a 0' }
  if (monto > maxMonto) return { error: `El monto no puede superar $${maxMonto.toLocaleString()}` }

  const { error } = await supabase.rpc('aplicar_saldo_favor_trx', {
    p_cuenta_id: cuenta_id,
    p_asistente_id: asistente_id,
    p_monto: monto,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/cuentas/${cuenta_id}`)
  revalidatePath(`/asistentes/${asistente_id}`)
  revalidatePath('/cuentas')
  return { success: true }
}

export async function editValorCuenta(
  cuenta_id: string,
  valor_anterior: number,
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const valor_nuevo_str = formData.get('valor_nuevo') as string
  const motivo = formData.get('motivo') as string

  if (!valor_nuevo_str || !motivo) return { error: 'Valor y motivo son obligatorios' }

  const valor_nuevo = Math.round(parseFloat(valor_nuevo_str))
  if (isNaN(valor_nuevo) || valor_nuevo <= 0) return { error: 'El valor debe ser mayor a 0' }

  const { error: updateError } = await supabase
    .from('cuentas_por_cobrar')
    .update({ valor_total: valor_nuevo })
    .eq('id', cuenta_id)

  if (updateError) return { error: updateError.message }

  await supabase.from('auditoria_financiera').insert([
    {
      tabla_afectada: 'cuentas_por_cobrar',
      registro_id: cuenta_id,
      usuario_id: user.id,
      accion: 'edicion_valor',
      valor_anterior,
      valor_nuevo,
      motivo,
    },
  ])

  const { data: cuentaData } = await supabase
    .from('cuentas_por_cobrar')
    .select('valor_total, pagos_abonos(monto, notas)')
    .eq('id', cuenta_id)
    .single()

  if (cuentaData) {
    const pagosValidos = cuentaData.pagos_abonos?.filter((p: any) => !p.notas?.includes('[ANULADO]')) || []
    const total_abonado = pagosValidos.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0)
    const nuevo_estado = calcularEstadoCuenta(Number(cuentaData.valor_total), total_abonado)
    await supabase.from('cuentas_por_cobrar').update({ estado: nuevo_estado }).eq('id', cuenta_id)
  }

  revalidatePath(`/cuentas/${cuenta_id}`)
  revalidatePath('/cuentas')
  return { success: true }
}

export async function editMontoAbono(
  abono_id: string,
  cuenta_id: string,
  valor_anterior: number,
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const valor_nuevo_str = formData.get('valor_nuevo') as string
  const motivo = formData.get('motivo') as string

  if (!valor_nuevo_str || !motivo) return { error: 'Valor y motivo son obligatorios' }

  const valor_nuevo = Math.round(parseFloat(valor_nuevo_str))
  if (isNaN(valor_nuevo) || valor_nuevo <= 0) return { error: 'El valor debe ser mayor a 0' }

  const { data: abono } = await supabase.from('pagos_abonos').select('origen_fondos').eq('id', abono_id).single()

  const { error: updateError } = await supabase.from('pagos_abonos').update({ monto: valor_nuevo }).eq('id', abono_id)
  if (updateError) return { error: updateError.message }

  if (abono?.origen_fondos === 'saldo_a_favor') {
    await supabase
      .from('movimientos_saldo_favor')
      .update({ monto: valor_nuevo })
      .eq('cuenta_id', cuenta_id)
      .eq('tipo', 'aplicacion')
      .eq('monto', valor_anterior)
  }

  await supabase.from('auditoria_financiera').insert([
    {
      tabla_afectada: 'pagos_abonos',
      registro_id: abono_id,
      usuario_id: user.id,
      accion: 'edicion_abono',
      valor_anterior,
      valor_nuevo,
      motivo,
    },
  ])

  const { data: cuentaData } = await supabase
    .from('cuentas_por_cobrar')
    .select('valor_total, pagos_abonos(monto, notas)')
    .eq('id', cuenta_id)
    .single()

  if (cuentaData) {
    const pagosValidos = cuentaData.pagos_abonos?.filter((p: any) => !p.notas?.includes('[ANULADO]')) || []
    const total_abonado = pagosValidos.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0)
    const nuevo_estado = calcularEstadoCuenta(Number(cuentaData.valor_total), total_abonado)
    await supabase.from('cuentas_por_cobrar').update({ estado: nuevo_estado }).eq('id', cuenta_id)
  }

  revalidatePath(`/cuentas/${cuenta_id}`)
  revalidatePath('/cuentas')
  return { success: true }
}
