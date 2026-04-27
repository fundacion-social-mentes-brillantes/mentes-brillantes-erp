'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin, requireRoles } from '@/lib/utils/authz'
import { parseMoneyInput } from '@/lib/utils/contable'
import { assertFechaEditable } from '@/lib/utils/periodos'

export type VentaExternaState = { error?: string; success?: boolean } | null

const TABLE = 'ventas_externas'
const REVALIDATE_PATHS = ['/ventas-externas', '/movimientos', '/dashboard', '/liquidaciones']

const revalidarVentasExternas = () => {
  REVALIDATE_PATHS.forEach((path) => revalidatePath(path))
}

async function audit(
  supabase: any,
  userId: string,
  accion: string,
  registroId: string,
  valorAnterior: number | null,
  valorNuevo: number | null,
  motivo?: string | null
) {
  await supabase.from('auditoria_financiera').insert([
    {
      tabla_afectada: TABLE,
      registro_id: registroId,
      usuario_id: userId,
      accion,
      valor_anterior: valorAnterior,
      valor_nuevo: valorNuevo,
      motivo: motivo || null,
    },
  ])
}

function leerPayload(formData: FormData) {
  const concepto = ((formData.get('concepto') as string) || '').trim()
  const comprador_nombre = ((formData.get('comprador_nombre') as string) || '').trim() || null
  const monto = parseMoneyInput(formData.get('monto'))
  const metodo_pago = ((formData.get('metodo_pago') as string) || '').trim()
  const fecha = ((formData.get('fecha') as string) || '').trim() || new Date().toISOString().split('T')[0]
  const notas = ((formData.get('notas') as string) || '').trim() || null

  return { concepto, comprador_nombre, monto, metodo_pago, fecha, notas }
}

export async function crearVentaExterna(prevState: VentaExternaState, formData: FormData): Promise<VentaExternaState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireRoles(['admin', 'caja']))
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const payload = leerPayload(formData)
  if (!payload.concepto || payload.monto === null || payload.monto <= 0 || !payload.metodo_pago || !payload.fecha) {
    return { error: 'Concepto, monto, metodo de pago y fecha son obligatorios. El monto debe ser mayor a 0.' }
  }

  const periodoError = await assertFechaEditable(supabase, payload.fecha, 'Crear la venta externa')
  if (periodoError) return { error: periodoError }

  const { data, error } = await supabase
    .from(TABLE)
    .insert([{ ...payload, usuario_id: user?.id || null }])
    .select('id')
    .single()

  if (error) return { error: error.message }

  await audit(supabase, user.id, 'crear_venta_externa', data.id, null, payload.monto, payload.notas)
  revalidarVentasExternas()
  redirect('/ventas-externas')
}

export async function editarVentaExterna(
  id: string,
  prevState: VentaExternaState,
  formData: FormData
): Promise<VentaExternaState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { data: actual, error: actualError } = await supabase
    .from(TABLE)
    .select('fecha, monto')
    .eq('id', id)
    .single()
  if (actualError || !actual) return { error: 'No se encontro la venta externa.' }

  const periodoActualError = await assertFechaEditable(supabase, actual.fecha, 'Editar la venta externa')
  if (periodoActualError) return { error: periodoActualError }

  const payload = leerPayload(formData)
  if (!payload.concepto || payload.monto === null || payload.monto <= 0 || !payload.metodo_pago || !payload.fecha) {
    return { error: 'Concepto, monto, metodo de pago y fecha son obligatorios. El monto debe ser mayor a 0.' }
  }

  const periodoNuevoError = await assertFechaEditable(supabase, payload.fecha, 'Editar la venta externa')
  if (periodoNuevoError) return { error: periodoNuevoError }

  const { error } = await supabase.from(TABLE).update({ ...payload, usuario_id: user?.id || null }).eq('id', id)
  if (error) return { error: error.message }

  await audit(supabase, user.id, 'editar_venta_externa', id, Number(actual.monto ?? 0), payload.monto, payload.notas)
  revalidarVentasExternas()
  redirect('/ventas-externas')
}

export async function anularVentaExterna(id: string): Promise<VentaExternaState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { data: actual, error: actualError } = await supabase
    .from(TABLE)
    .select('fecha, monto, notas')
    .eq('id', id)
    .single()
  if (actualError || !actual) return { error: 'No se encontro la venta externa.' }

  const periodoError = await assertFechaEditable(supabase, actual.fecha, 'Anular la venta externa')
  if (periodoError) return { error: periodoError }

  const { error } = await supabase
    .from(TABLE)
    .update({
      estado: 'anulado',
      notas: actual.notas ? `[ANULADO] ${actual.notas}` : '[ANULADO]',
    })
    .eq('id', id)
  if (error) return { error: error.message }

  await audit(supabase, user.id, 'anular_venta_externa', id, Number(actual.monto ?? 0), 0, 'Anulacion de venta externa')
  revalidarVentasExternas()
  return { success: true }
}

export async function eliminarVentaExterna(id: string): Promise<VentaExternaState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { data: actual, error: actualError } = await supabase.from(TABLE).select('fecha, monto').eq('id', id).single()
  if (actualError || !actual) return { error: 'No se encontro la venta externa.' }

  const periodoError = await assertFechaEditable(supabase, actual.fecha, 'Eliminar la venta externa')
  if (periodoError) return { error: periodoError }

  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { error: error.message }

  await audit(supabase, user.id, 'eliminar_venta_externa', id, Number(actual.monto ?? 0), null, 'Eliminacion definitiva')
  revalidarVentasExternas()
  return { success: true }
}
