import { paqueteDestino, resumenCoach } from "@/lib/utils/coach"
import { OperacionError, exigirFechaIso } from "./errores"
import type { ActorErp } from "./abonos"

// Registrar una sesion coach a nivel de persona: elige automaticamente el
// paquete mas antiguo con cupo, sin sobre-llenar ni usar los agotados.

export type RegistrarSesionCoachParams = {
  asistenteId: string
  fecha: string
  notas?: string | null
}

export type PrevisualizacionSesionCoach = {
  paqueteId: string
  compradas: number
  realizadas: number
  restantesAntes: number
  restantesDespues: number
  fecha: string
}

async function paquetesDe(supabase: any, asistenteId: string) {
  const { data, error } = await supabase
    .from("coach_paquetes")
    .select("id, cuenta_id, asistente_id, sesiones_compradas, creado_en, coach_sesiones (id)")
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

  return {
    paqueteId: destino.id,
    compradas,
    realizadas,
    restantesAntes: restantes,
    restantesDespues: Math.max(0, restantes - 1),
    fecha,
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

  const { error } = await supabase.from("coach_sesiones").insert([
    {
      paquete_id: destino.id,
      asistente_id: params.asistenteId,
      fecha,
      notas: params.notas && String(params.notas).trim() ? String(params.notas).trim() : null,
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
