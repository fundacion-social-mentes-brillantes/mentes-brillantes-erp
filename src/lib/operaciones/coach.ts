import { paqueteDestino, resumenCoach } from "@/lib/utils/coach"
import { OperacionError, exigirFechaIso } from "./errores"
import type { ActorErp } from "./abonos"

// Registrar una sesion coach a nivel de persona: elige automaticamente el
// paquete mas antiguo con cupo, sin sobre-llenar ni usar los agotados.

export type RegistrarSesionCoachParams = {
  asistenteId: string
  fecha: string
  notas?: string | null
  /**
   * Evento de la agenda del que sale la sesion, si viene de alli. Sin este
   * enlace el ERP no puede notar que borraron de la agenda algo ya cobrado:
   * cruzar por persona+fecha alcanza para saber que la sesion ya esta, pero no
   * para seguirle el rastro al evento.
   */
  eventoAgendaId?: string | null
}

export type PrevisualizacionSesionCoach = {
  paqueteId: string
  compradas: number
  realizadas: number
  restantesAntes: number
  restantesDespues: number
  fecha: string
  /**
   * De que paquete sale la sesion. Se consume siempre el credito prepagado mas
   * antiguo con cupo, asi que puede NO ser el que se acaba de comprar. Saberlo
   * antes evita la sorpresa de ver la sesion colgada de una compra vieja.
   */
  paquete: {
    concepto: string | null
    compradoEl: string | null
    diasDeAntiguedad: number | null
  }
}

async function paquetesDe(supabase: any, asistenteId: string) {
  const { data, error } = await supabase
    .from("coach_paquetes")
    .select(
      "id, cuenta_id, asistente_id, sesiones_compradas, creado_en, coach_sesiones (id), cuentas_por_cobrar (concepto, fecha_emision)"
    )
    .eq("asistente_id", asistenteId)

  if (error) throw new OperacionError("No se pudieron consultar los paquetes coach de la persona.")
  if (!data || data.length === 0) throw new OperacionError("Esa persona no tiene un paquete coach.")
  return data
}

function elegirPaquete(paquetes: any[]) {
  const destino = paqueteDestino(paquetes as any)
  if (!destino) throw new OperacionError("No quedan sesiones disponibles en los paquetes de esa persona.")
  return destino
}

export async function previsualizarSesionCoach(
  supabase: any,
  params: RegistrarSesionCoachParams
): Promise<PrevisualizacionSesionCoach> {
  const fecha = exigirFechaIso(params.fecha)
  const paquetes = await paquetesDe(supabase, params.asistenteId)
  const destino = elegirPaquete(paquetes)
  const { compradas, realizadas, restantes } = resumenCoach(paquetes as any)

  const cuenta = Array.isArray((destino as any).cuentas_por_cobrar)
    ? (destino as any).cuentas_por_cobrar[0]
    : (destino as any).cuentas_por_cobrar
  const compradoEl: string | null = cuenta?.fecha_emision ?? null
  const diasDeAntiguedad = compradoEl
    ? Math.floor(
        (new Date(`${fecha}T00:00:00Z`).getTime() - new Date(`${compradoEl}T00:00:00Z`).getTime()) / 86400000
      )
    : null

  return {
    paqueteId: destino.id,
    compradas,
    realizadas,
    restantesAntes: restantes,
    restantesDespues: Math.max(0, restantes - 1),
    fecha,
    paquete: {
      concepto: cuenta?.concepto ?? null,
      compradoEl,
      diasDeAntiguedad,
    },
  }
}

export async function registrarSesionCoach(
  supabase: any,
  _actor: ActorErp,
  params: RegistrarSesionCoachParams
) {
  const fecha = exigirFechaIso(params.fecha)
  const paquetes = await paquetesDe(supabase, params.asistenteId)
  const destino = elegirPaquete(paquetes)

  const eventoAgendaId = params.eventoAgendaId ? String(params.eventoAgendaId).trim().slice(0, 128) : null

  const { error } = await supabase.from("coach_sesiones").insert([
    {
      paquete_id: destino.id,
      asistente_id: params.asistenteId,
      fecha,
      notas: params.notas && String(params.notas).trim() ? String(params.notas).trim() : null,
      evento_agenda_id: eventoAgendaId || null,
    },
  ])

  if (error) throw new OperacionError(error.message || "No se pudo registrar la sesion coach.")

  // Autocompleta el inicio de proceso solo si aun no estaba definido.
  await supabase
    .from("asistentes")
    .update({ fecha_inicio_proceso: fecha })
    .eq("id", params.asistenteId)
    .is("fecha_inicio_proceso", null)

  const { restantes } = resumenCoach(paquetes as any)
  return {
    paqueteId: destino.id,
    cuentaId: (destino as any).cuenta_id ?? null,
    fecha,
    restantesDespues: Math.max(0, restantes - 1),
  }
}

// --------------------------------------------------- editar / eliminar sesion

async function leerSesion(supabase: any, sesionId: string) {
  const { data, error } = await supabase
    .from("coach_sesiones")
    .select("id, fecha, notas, paquete_id, asistente_id, asistentes(nombre)")
    .eq("id", sesionId)
    .single()
  if (error || !data) throw new OperacionError("No encontre esa sesion coach.")
  return data
}

export async function previsualizarEdicionSesion(
  supabase: any,
  params: { sesionId: string; fecha?: string; notas?: string | null }
) {
  const sesion = await leerSesion(supabase, params.sesionId)
  const fechaNueva = params.fecha ? exigirFechaIso(params.fecha) : null

  const cambios: Record<string, { antes: unknown; despues: unknown }> = {}
  if (fechaNueva && fechaNueva !== sesion.fecha) cambios.fecha = { antes: sesion.fecha, despues: fechaNueva }
  if (params.notas !== undefined && params.notas !== sesion.notas) {
    cambios.notas = { antes: sesion.notas, despues: params.notas }
  }
  if (Object.keys(cambios).length === 0) throw new OperacionError("No indicaste ningun cambio.")

  const persona = Array.isArray(sesion.asistentes) ? sesion.asistentes[0] : sesion.asistentes
  return { sesionId: params.sesionId, personaNombre: persona?.nombre ?? null, fechaActual: sesion.fecha, cambios }
}

export async function editarSesionCoach(
  supabase: any,
  _actor: ActorErp,
  params: { sesionId: string; fecha?: string; notas?: string | null }
) {
  const v = await previsualizarEdicionSesion(supabase, params)

  const payload: Record<string, unknown> = {}
  if (params.fecha !== undefined) payload.fecha = params.fecha
  if (params.notas !== undefined) payload.notas = params.notas

  const { error } = await supabase.from("coach_sesiones").update(payload).eq("id", params.sesionId)
  if (error) throw new OperacionError(error.message || "No se pudo editar la sesion coach.")
  return { sesionId: params.sesionId, cambios: v.cambios }
}

export async function previsualizarEliminacionSesion(supabase: any, sesionId: string) {
  const sesion = await leerSesion(supabase, sesionId)
  const persona = Array.isArray(sesion.asistentes) ? sesion.asistentes[0] : sesion.asistentes
  return {
    sesionId,
    personaNombre: persona?.nombre ?? null,
    fecha: sesion.fecha,
    efecto: "La sesion se borra y vuelve a quedar disponible en el paquete de la persona.",
  }
}

export async function eliminarSesionCoach(supabase: any, _actor: ActorErp, sesionId: string) {
  const v = await previsualizarEliminacionSesion(supabase, sesionId)
  const { error } = await supabase.from("coach_sesiones").delete().eq("id", sesionId)
  if (error) throw new OperacionError(error.message || "No se pudo eliminar la sesion coach.")
  return { sesionId, personaNombre: v.personaNombre, fecha: v.fecha }
}
