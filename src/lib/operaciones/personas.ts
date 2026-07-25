import { OperacionError, exigir } from "./errores"
import type { ActorErp } from "./abonos"

// Alta y edicion de personas (asistentes). Sin dinero de por medio, pero es la
// puerta de entrada: sin persona no hay cuentas ni pagos.

export type DatosPersona = {
  nombre: string
  cedula?: string | null
  correo?: string | null
  telefono?: string | null
  codigo?: string | null
  fechaRegistro?: string | null
  fechaInicioProceso?: string | null
}

function limpiar(v: unknown): string | null {
  const s = String(v ?? "").trim()
  return s ? s : null
}

/**
 * Solo `admin` puede fijar las fechas de registro e inicio de proceso; `caja`
 * las deja como esten (misma regla que el formulario de la web).
 */
function payload(datos: DatosPersona, rol: ActorErp["role"]) {
  const base: Record<string, string | null> = {
    nombre: String(datos.nombre).trim(),
    cedula: limpiar(datos.cedula),
    correo: limpiar(datos.correo),
    telefono: limpiar(datos.telefono),
    codigo: limpiar(datos.codigo),
  }
  if (rol === "admin") {
    base.fecha_registro = limpiar(datos.fechaRegistro)
    base.fecha_inicio_proceso = limpiar(datos.fechaInicioProceso)
  }
  return base
}

function traducirError(error: any): OperacionError {
  if (error?.code === "23505") {
    return new OperacionError("Ya existe una persona con esa cedula o codigo.")
  }
  return new OperacionError(error?.message || "No se pudo guardar la persona.")
}

export async function crearPersona(supabase: any, actor: ActorErp, datos: DatosPersona) {
  exigir(String(datos.nombre || "").trim(), "El nombre es obligatorio.")

  const { data, error } = await supabase
    .from("asistentes")
    .insert([payload(datos, actor.role)])
    .select("id, nombre, codigo")
    .single()

  if (error || !data) throw traducirError(error)
  return { id: data.id as string, nombre: data.nombre as string, codigo: data.codigo as string | null }
}

export async function editarPersona(
  supabase: any,
  actor: ActorErp,
  asistenteId: string,
  datos: DatosPersona
) {
  exigir(asistenteId, "Falta indicar a quien se edita.")
  exigir(String(datos.nombre || "").trim(), "El nombre es obligatorio.")

  const { error } = await supabase.from("asistentes").update(payload(datos, actor.role)).eq("id", asistenteId)
  if (error) throw traducirError(error)
  return { id: asistenteId, nombre: String(datos.nombre).trim() }
}

export async function buscarPersonaPorId(supabase: any, asistenteId: string) {
  const { data, error } = await supabase
    .from("asistentes")
    .select("id, nombre, codigo, cedula, correo, telefono, activo")
    .eq("id", asistenteId)
    .single()
  if (error || !data) throw new OperacionError("No encontre esa persona.")
  return data
}
