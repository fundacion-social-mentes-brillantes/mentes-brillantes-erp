'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/utils/authz'

export type CoachActionState = { error?: string; success?: boolean } | null

export async function registrarSesion(prev: CoachActionState, formData: FormData): Promise<CoachActionState> {
  let supabase
  try {
    ({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const paquete_id = formData.get('paquete_id') as string
  const fecha = (formData.get('fecha') as string) || new Date().toISOString().split('T')[0]
  const notas = (formData.get('notas') as string) || null

  if (!paquete_id) return { error: 'Paquete requerido' }

  const { data: paquete } = await supabase
    .from('coach_paquetes')
    .select('id, cuenta_id, asistente_id, sesiones_compradas, coach_sesiones (id)')
    .eq('id', paquete_id)
    .single()

  if (!paquete) return { error: 'Paquete no encontrado' }

  const realizadas = paquete.coach_sesiones?.length || 0
  if (realizadas >= paquete.sesiones_compradas) {
    return { error: 'No quedan sesiones disponibles en este paquete.' }
  }

  const { error } = await supabase.from('coach_sesiones').insert([{
    paquete_id,
    asistente_id: paquete.asistente_id,
    fecha,
    notas
  }])

  if (error) return { error: error.message }

  revalidatePath(`/cuentas/${paquete.cuenta_id}`)
  revalidatePath(`/asistentes/${paquete.asistente_id}`)
  return { success: true }
}

export async function getCoachSummary(asistente_id: string) {
  const supabase = await import('@/lib/supabase/server').then(m => m.createClient())
  if (!supabase) return null

  const { data: paquetes } = await supabase
    .from('coach_paquetes')
    .select('id, cuenta_id, sesiones_compradas, coach_sesiones (id)')
    .eq('asistente_id', asistente_id)

  if (!paquetes) return null

  const compradas = paquetes.reduce((acc, p) => acc + (p.sesiones_compradas || 0), 0)
  const realizadas = paquetes.reduce((acc, p) => acc + (p.coach_sesiones?.length || 0), 0)

  return {
    paquetes,
    compradas,
    realizadas,
    restantes: Math.max(0, compradas - realizadas),
    totalHistorico: realizadas,
  }
}
