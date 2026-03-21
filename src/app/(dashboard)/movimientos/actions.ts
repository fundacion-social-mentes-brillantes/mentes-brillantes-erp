'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/utils/authz'

export type ActionState = {
  error?: string;
  success?: boolean;
} | null;

export async function anularMovimiento(
  movimiento_id: string,
  tipo_movimiento: string,
  valor_ingreso: number,
  asistente_id: string | null
): Promise<ActionState> {
  let supabase, user
  try {
    ({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  if (tipo_movimiento === 'abono' || tipo_movimiento === 'aplicacion_saldo') {
    const { data: pago } = await supabase
      .from('pagos_abonos')
      .select('origen_fondos, metodo_pago')
      .eq('id', movimiento_id)
      .single()

    const origenFondos = pago?.origen_fondos?.toLowerCase?.()
    const metodoPago = pago?.metodo_pago?.toLowerCase?.()
    const esSaldoFavor = origenFondos === 'saldo_a_favor' || metodoPago === 'saldo_a_favor'
    if (esSaldoFavor) {
      return { error: 'No se puede anular este pago porque proviene de saldo a favor. Usa el flujo de devolución de saldo cuando esté disponible.' }
    }
  }

  const { error } = await supabase.rpc('rpc_anular_movimiento', {
    p_movimiento_id: movimiento_id,
    p_tipo_movimiento: tipo_movimiento,
    p_valor_ingreso: valor_ingreso,
    p_asistente_id: asistente_id,
    p_user_id: user.id
  })

  if (error) return { error: error.message }

  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/asistentes')
  revalidatePath('/cuentas')

  return { success: true }
}

export async function editarMovimiento(
  movimiento_id: string,
  tipo_movimiento: string,
  newData: any
): Promise<ActionState> {
  let supabase, user
  try {
    ({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { error } = await supabase.rpc('rpc_editar_movimiento', {
    p_movimiento_id: movimiento_id,
    p_tipo_movimiento: tipo_movimiento,
    p_nuevos_datos: newData,
    p_user_id: user.id
  })

  if (error) return { error: error.message }

  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/asistentes')
  revalidatePath('/cuentas')
  
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
    ({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { error } = await supabase.rpc('rpc_eliminar_movimiento', {
    p_movimiento_id: movimiento_id,
    p_tipo_movimiento: tipo_movimiento,
    p_valor_ingreso: valor_ingreso,
    p_asistente_id: asistente_id,
    p_user_id: user.id
  })

  if (error) return { error: error.message }

  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/asistentes')
  revalidatePath('/cuentas')
  
  return { success: true }
}
