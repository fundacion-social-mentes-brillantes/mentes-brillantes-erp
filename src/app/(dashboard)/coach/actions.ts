'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin, requireRoles } from '@/lib/utils/authz'
import { fechaHoyBogota } from '@/lib/utils/fechas'
import { resumenCoach } from '@/lib/utils/coach'
import { errorDeAccion } from '@/lib/utils/acciones'
import { createClient } from '@/lib/supabase/server'
import { editarSesionCoach, eliminarSesionCoach, registrarSesionCoach } from '@/lib/operaciones/coach'
import { SinCambiosError } from '@/lib/operaciones/errores'

// Sesiones coach. Registrar, corregir y borrar pasan por
// lib/operaciones/coach.ts, las mismas reglas que usan el MCP y la agenda.

export type CoachActionState = { error?: string; success?: boolean } | null

const textoDe = (formData: FormData, campo: string) => {
  const valor = formData.get(campo)
  return typeof valor === 'string' ? valor.trim() : ''
}

function refrescar(asistenteId: string | null, cuentaId: string | null) {
  if (cuentaId) revalidatePath(`/cuentas/${cuentaId}`)
  if (asistenteId) revalidatePath(`/asistentes/${asistenteId}`)
  revalidatePath('/sesiones-coach')
}

/** Registra una sesion en un paquete concreto (desde el detalle de la cuenta). */
export async function registrarSesion(_prev: CoachActionState, formData: FormData): Promise<CoachActionState> {
  const paqueteId = textoDe(formData, 'paquete_id')
  if (!paqueteId) return { error: 'Paquete requerido' }

  let asistenteId: string | null = null
  let cuentaId: string | null = null
  try {
    const { supabase, user, perfil } = await requireRoles(['admin', 'caja'])
    const { data: paquete } = await supabase.from('coach_paquetes').select('asistente_id').eq('id', paqueteId).single()
    if (!paquete) return { error: 'Paquete no encontrado' }

    asistenteId = paquete.asistente_id
    const r = await registrarSesionCoach(
      supabase,
      { userId: user.id, role: perfil.rol === 'admin' ? 'admin' : 'caja' },
      { asistenteId, paqueteId, fecha: textoDe(formData, 'fecha') || fechaHoyBogota(), notas: textoDe(formData, 'notas') || null }
    )
    cuentaId = r.cuentaId
  } catch (e) {
    return errorDeAccion(e, 'No se pudo registrar la sesion coach.', 'coach')
  }

  refrescar(asistenteId, cuentaId)
  return { success: true }
}

async function datosDeSesion(sesionId: string) {
  const { supabase } = await requireAdmin()
  const { data } = await supabase
    .from('coach_sesiones')
    .select('asistente_id, coach_paquetes (cuenta_id)')
    .eq('id', sesionId)
    .single()
  const paquete = Array.isArray(data?.coach_paquetes) ? data?.coach_paquetes[0] : data?.coach_paquetes
  return { asistenteId: data?.asistente_id ?? null, cuentaId: paquete?.cuenta_id ?? null }
}

export async function editarSesion(_prev: CoachActionState, formData: FormData): Promise<CoachActionState> {
  const sesionId = textoDe(formData, 'sesion_id')
  if (!sesionId) return { error: 'Sesión requerida' }

  let destino = { asistenteId: null as string | null, cuentaId: null as string | null }
  try {
    const { supabase, user } = await requireAdmin()
    destino = await datosDeSesion(sesionId)
    await editarSesionCoach(supabase, { userId: user.id, role: 'admin' }, {
      sesionId,
      fecha: textoDe(formData, 'fecha') || fechaHoyBogota(),
      notas: textoDe(formData, 'notas') || null,
    })
  } catch (e) {
    if (!(e instanceof SinCambiosError)) return errorDeAccion(e, 'No se pudo editar la sesion coach.', 'coach')
  }

  refrescar(destino.asistenteId, destino.cuentaId)
  return { success: true }
}

export async function eliminarSesion(_prev: CoachActionState, formData: FormData): Promise<CoachActionState> {
  const sesionId = textoDe(formData, 'sesion_id')
  if (!sesionId) return { error: 'Sesión requerida' }

  let destino = { asistenteId: null as string | null, cuentaId: null as string | null }
  try {
    const { supabase, user } = await requireAdmin()
    destino = await datosDeSesion(sesionId)
    await eliminarSesionCoach(supabase, { userId: user.id, role: 'admin' }, sesionId)
  } catch (e) {
    return errorDeAccion(e, 'No se pudo eliminar la sesion coach.', 'coach')
  }

  refrescar(destino.asistenteId, destino.cuentaId)
  return { success: true }
}

export async function getCoachSummary(asistente_id: string) {
  // Lectura con la sesion de quien mira: las politicas de la base deciden que ve.
  const supabase = await createClient()
  if (!supabase) return null

  const { data: paquetes } = await supabase
    .from('coach_paquetes')
    .select('id, cuenta_id, sesiones_compradas, coach_sesiones (id)')
    .eq('asistente_id', asistente_id)

  if (!paquetes) return null

  const { compradas, realizadas, restantes } = resumenCoach(paquetes)

  return {
    paquetes,
    compradas,
    realizadas,
    restantes,
    totalHistorico: realizadas,
  }
}

// Registra una sesion coach a nivel de asistente: elige automaticamente el
// paquete mas antiguo con cupo disponible (sin sobre-llenar ni usar agotados) y
// usa fecha local de Colombia por defecto. Reutilizada por la pagina
// /sesiones-coach; refleja el cambio en el perfil del asistente y la cuenta.
export async function registrarSesionCoachAsistente(
  asistenteId: string,
  fecha?: string | null,
  notas?: string | null
): Promise<CoachActionState> {
  if (!asistenteId) return { error: 'Asistente requerido' }

  const fechaSesion = typeof fecha === 'string' && fecha.trim() ? fecha.trim() : fechaHoyBogota()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaSesion)) {
    return { error: 'La fecha no tiene un formato valido.' }
  }

  let cuentaId: string | null = null
  try {
    const { supabase, user, perfil } = await requireRoles(['admin', 'caja'])
    // Nucleo compartido con el MCP: elige el paquete mas antiguo con cupo,
    // inserta la sesion y autocompleta el inicio de proceso.
    const r = await registrarSesionCoach(
      supabase,
      { userId: user.id, role: perfil.rol === 'admin' ? 'admin' : 'caja' },
      { asistenteId, fecha: fechaSesion, notas }
    )
    cuentaId = r.cuentaId
  } catch (e) {
    return errorDeAccion(e, 'No se pudo registrar la sesion coach.', 'coach')
  }

  refrescar(asistenteId, cuentaId)
  return { success: true }
}
