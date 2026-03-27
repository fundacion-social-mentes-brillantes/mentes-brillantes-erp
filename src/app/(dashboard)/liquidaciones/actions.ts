'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/utils/authz'

export type ActionState = {
  error?: string
  success?: boolean
} | null

export async function savePeriodo(prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const nombre = formData.get('nombre') as string
  const fecha_inicio = formData.get('fecha_inicio') as string
  const fecha_fin = formData.get('fecha_fin') as string

  if (!nombre || !fecha_inicio || !fecha_fin) {
    return { error: 'Todos los campos son obligatorios' }
  }

  if (new Date(fecha_inicio) > new Date(fecha_fin)) {
    return { error: 'La fecha de inicio no puede ser mayor a la fecha de fin' }
  }

  const { data: periodosAbiertos } = await supabase.from('periodos').select('id').eq('estado', 'abierto')
  if (periodosAbiertos && periodosAbiertos.length > 0) {
    return { error: 'Ya existe un período abierto. Debes cerrarlo antes de crear uno nuevo.' }
  }

  const { error } = await supabase.from('periodos').insert([
    {
      nombre,
      fecha_inicio,
      fecha_fin,
      estado: 'abierto',
    },
  ])

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/liquidaciones')
  redirect('/liquidaciones')
}

export async function saveAdelanto(periodo_id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const socio_id = formData.get('socio_id') as string
  const monto_str = formData.get('monto') as string
  const fecha = formData.get('fecha') as string
  const notas = formData.get('notas') as string
   const metodo_pago = (formData.get('metodo_pago') as string) || 'otro'

  const monto = parseFloat(monto_str)

  if (!socio_id || !monto_str || !fecha || !metodo_pago) {
    return { error: 'Socio, monto, fecha y método de pago son obligatorios' }
  }

  if (isNaN(monto) || monto <= 0) {
    return { error: 'El monto debe ser mayor a 0' }
  }

  const { error } = await supabase.from('adelantos_socios').insert([
    {
      socio_id,
      periodo_id,
      monto,
      fecha,
      metodo_pago,
      notas: notas || null,
    },
  ])

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/liquidaciones/${periodo_id}`)
  return { success: true }
}

export async function generarLiquidacion(periodo_id: string) {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch {
    return
  }

  const { data: periodo } = await supabase.from('periodos').select('estado').eq('id', periodo_id).single()
  if (!periodo || periodo.estado !== 'abierto') return

  const { error } = await supabase.rpc('fn_cerrar_liquidacion', { p_periodo_id: periodo_id })
  if (error) {
    console.error('Error RPC fn_cerrar_liquidacion:', error)
    return
  }

  revalidatePath('/liquidaciones')
  revalidatePath(`/liquidaciones/${periodo_id}`)
}
