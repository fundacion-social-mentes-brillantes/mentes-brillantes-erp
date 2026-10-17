import type { DbClient } from "@/lib/supabase/types"
import { crearTokenEnlace, leerTokenEnlace } from "./token"

// Encender, cambiar y apagar el enlace "Mi proceso" de una persona, y validar
// el que llega a /p/<token>. Todo con el cliente del servidor (service role):
// la tabla enlaces_personales no tiene permisos para nadie mas.

/** Direccion publica del ERP (la misma que usan el bot de Telegram y el MCP). */
export const ORIGEN_PUBLICO = "https://mentes-brillantes-erp.vercel.app"

export type EstadoEnlace = {
  activo: boolean
  version: number
  creadoEn: string
  ultimoAcceso: string | null
}

export function urlEnlace(asistenteId: string, version: number, secreto: string): string {
  return `${ORIGEN_PUBLICO}/p/${crearTokenEnlace(asistenteId, version, secreto)}`
}

export async function estadoEnlace(admin: DbClient, asistenteId: string): Promise<EstadoEnlace | null> {
  const { data, error } = await admin
    .from("enlaces_personales")
    .select("activo, version, creado_en, ultimo_acceso")
    .eq("asistente_id", asistenteId)
    .maybeSingle()
  if (error) throw new Error("No se pudo leer el enlace personal.")
  if (!data) return null
  return { activo: data.activo, version: data.version, creadoEn: data.creado_en, ultimoAcceso: data.ultimo_acceso }
}

/**
 * Deja el enlace encendido y devuelve su version. Si estaba apagado se enciende
 * con una version NUEVA: si se apago porque se reenvio a quien no era, el
 * enlace viejo no debe volver a servir.
 */
export async function encenderEnlace(admin: DbClient, asistenteId: string, usuarioId: string | null) {
  const actual = await estadoEnlace(admin, asistenteId)
  if (actual?.activo) return actual.version
  return guardar(admin, asistenteId, usuarioId, actual ? actual.version + 1 : 1)
}

/** Enlace nuevo: el anterior deja de funcionar. */
export async function cambiarEnlace(admin: DbClient, asistenteId: string, usuarioId: string | null) {
  const actual = await estadoEnlace(admin, asistenteId)
  return guardar(admin, asistenteId, usuarioId, actual ? actual.version + 1 : 1)
}

export async function apagarEnlace(admin: DbClient, asistenteId: string) {
  const { error } = await admin
    .from("enlaces_personales")
    .update({ activo: false, actualizado_en: new Date().toISOString() })
    .eq("asistente_id", asistenteId)
  if (error) throw new Error("No se pudo apagar el enlace personal.")
}

async function guardar(admin: DbClient, asistenteId: string, usuarioId: string | null, version: number) {
  const { error } = await admin.from("enlaces_personales").upsert(
    {
      asistente_id: asistenteId,
      version,
      activo: true,
      creado_por: usuarioId,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "asistente_id" }
  )
  if (error) throw new Error("No se pudo guardar el enlace personal.")
  return version
}

/** De quien es el enlace, si esta bien firmado, encendido y en su version vigente. */
export async function validarEnlace(admin: DbClient, token: string, secreto: string): Promise<string | null> {
  const datos = leerTokenEnlace(token, secreto)
  if (!datos) return null
  const estado = await estadoEnlace(admin, datos.asistenteId)
  if (!estado?.activo || estado.version !== datos.version) return null
  return datos.asistenteId
}

export type ConsultaEnlace =
  | { estado: "encendido"; enlace: string; ultimo_acceso: string | null }
  | { estado: "apagado" | "sin_enlace"; mensaje: string }

/** Lo que responde el MCP cuando le piden el enlace de alguien. */
export async function consultarEnlace(admin: DbClient, asistenteId: string, secreto: string): Promise<ConsultaEnlace> {
  const estado = await estadoEnlace(admin, asistenteId)
  if (estado?.activo) {
    return { estado: "encendido", enlace: urlEnlace(asistenteId, estado.version, secreto), ultimo_acceso: estado.ultimoAcceso }
  }
  return {
    estado: estado ? "apagado" : "sin_enlace",
    mensaje: estado
      ? "Su enlace esta apagado. Para darle uno nuevo, usa preparar_enlace_personal con accion crear."
      : "Todavia no tiene enlace. Para crearlo, usa preparar_enlace_personal con accion crear.",
  }
}

/** Anota cuando la persona abrio su pagina (para que el equipo lo vea). */
export async function anotarAcceso(admin: DbClient, asistenteId: string) {
  await admin
    .from("enlaces_personales")
    .update({ ultimo_acceso: new Date().toISOString() })
    .eq("asistente_id", asistenteId)
}
