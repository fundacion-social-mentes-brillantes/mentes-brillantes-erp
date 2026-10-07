import type { DbClient } from "@/lib/supabase/types"
import { OperacionError } from "./errores"
import type { ActorErp } from "./abonos"

// Datos de la fundacion (nombre, NIT y contacto) que salen en las
// liquidaciones exportadas. Misma regla que la pantalla de Configuracion de la
// web: solo admin, y el nombre y el NIT no pueden quedar vacios.

export type DatosEmpresa = {
  nombre: string
  nit: string
  correo: string | null
  telefono: string | null
  ciudad: string | null
}

export type CambiosEmpresa = Partial<DatosEmpresa>

const CAMPOS = ["nombre", "nit", "correo", "telefono", "ciudad"] as const
const OBLIGATORIOS = new Set(["nombre", "nit"])

export async function leerConfiguracionEmpresa(supabase: DbClient): Promise<DatosEmpresa> {
  const { data, error } = await supabase
    .from("configuracion_empresa")
    .select("nombre, nit, correo, telefono, ciudad")
    .eq("id", 1)
    .single()
  if (error || !data) throw new OperacionError("No se pudo leer la configuracion de la fundacion.")
  return data
}

export async function previsualizarConfiguracionEmpresa(supabase: DbClient, cambios: CambiosEmpresa) {
  const actual = await leerConfiguracionEmpresa(supabase)
  const resultado: Partial<Record<keyof DatosEmpresa, { antes: string | null; despues: string | null }>> = {}

  for (const campo of CAMPOS) {
    if (cambios[campo] === undefined) continue
    const despues = String(cambios[campo] ?? "").trim() || null
    if (!despues && OBLIGATORIOS.has(campo)) {
      throw new OperacionError(`El ${campo === "nit" ? "NIT" : "nombre"} de la fundacion no puede quedar vacio.`)
    }
    const antes = actual[campo] ?? null
    if (antes !== despues) resultado[campo] = { antes, despues }
  }

  if (Object.keys(resultado).length === 0) throw new OperacionError("No hay nada que cambiar: esos ya son los datos.")
  return { actual, cambios: resultado }
}

export async function actualizarConfiguracionEmpresa(supabase: DbClient, _actor: ActorErp, cambios: CambiosEmpresa) {
  const previa = await previsualizarConfiguracionEmpresa(supabase, cambios)

  const payload: Record<string, string | null> = {}
  for (const [campo, cambio] of Object.entries(previa.cambios)) payload[campo] = cambio!.despues

  const { error } = await supabase
    .from("configuracion_empresa")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", 1)
  if (error) throw new OperacionError("No se pudo actualizar la configuracion: " + error.message)

  return { camposCambiados: Object.keys(previa.cambios) }
}
