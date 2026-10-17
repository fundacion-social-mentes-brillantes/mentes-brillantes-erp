"use server"

import { revalidatePath } from "next/cache"
import { requireRoles } from "@/lib/utils/authz"
import { createAdminClient } from "@/lib/supabase/admin"
import { mensajeDeError } from "@/lib/utils/errores"
import { apagarEnlace, cambiarEnlace, encenderEnlace, urlEnlace } from "@/lib/enlaces-personales/enlaces"
import { secretoEnlaces } from "@/lib/enlaces-personales/token"

// El enlace "Mi proceso" de una persona, desde su ficha. Lo manejan admin y caja
// (son quienes hablan con la gente); la tabla solo la toca el servidor.

export type ResultadoEnlace = { url?: string; error?: string; apagado?: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function preparar(asistenteId: string) {
  if (!UUID.test(asistenteId)) throw new Error("Persona no válida.")
  const { user } = await requireRoles(["admin", "caja"])
  const admin = createAdminClient()
  const secreto = secretoEnlaces()
  if (!admin || !secreto) {
    throw new Error("Los enlaces personales no están configurados en el servidor (falta ENLACES_PERSONALES_SECRETO).")
  }
  return { admin, secreto, usuarioId: user.id }
}

/** Crea el enlace (o devuelve el que ya esta encendido). */
export async function encenderEnlacePersonal(asistenteId: string): Promise<ResultadoEnlace> {
  try {
    const { admin, secreto, usuarioId } = await preparar(asistenteId)
    const version = await encenderEnlace(admin, asistenteId, usuarioId)
    revalidatePath(`/asistentes/${asistenteId}`)
    return { url: urlEnlace(asistenteId, version, secreto) }
  } catch (e) {
    return { error: mensajeDeError(e, "No se pudo crear el enlace.") }
  }
}

/** Enlace nuevo: el que se habia enviado deja de funcionar. */
export async function cambiarEnlacePersonal(asistenteId: string): Promise<ResultadoEnlace> {
  try {
    const { admin, secreto, usuarioId } = await preparar(asistenteId)
    const version = await cambiarEnlace(admin, asistenteId, usuarioId)
    revalidatePath(`/asistentes/${asistenteId}`)
    return { url: urlEnlace(asistenteId, version, secreto) }
  } catch (e) {
    return { error: mensajeDeError(e, "No se pudo cambiar el enlace.") }
  }
}

export async function apagarEnlacePersonal(asistenteId: string): Promise<ResultadoEnlace> {
  try {
    const { admin } = await preparar(asistenteId)
    await apagarEnlace(admin, asistenteId)
    revalidatePath(`/asistentes/${asistenteId}`)
    return { apagado: true }
  } catch (e) {
    return { error: mensajeDeError(e, "No se pudo apagar el enlace.") }
  }
}
