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

/** Activar o desactivar una persona (no borra nada; deja de aparecer activa). */
export async function cambiarEstadoPersona(supabase: any, _actor: ActorErp, asistenteId: string, activo: boolean) {
  exigir(asistenteId, "Falta indicar la persona.")
  const { error } = await supabase.from("asistentes").update({ activo }).eq("id", asistenteId)
  if (error) throw new OperacionError(error.message || "No se pudo cambiar el estado de la persona.")
  return { id: asistenteId, activo }
}

/**
 * Borrado de persona. Solo procede si NO tiene cuentas: si las tuviera, la
 * cascada arrastraria pagos y sesiones y desapareceria dinero del historial.
 */
export async function previsualizarEliminacionPersona(supabase: any, asistenteId: string) {
  const persona = await buscarPersonaPorId(supabase, asistenteId)

  const { count, error } = await supabase
    .from("cuentas_por_cobrar")
    .select("id", { count: "exact", head: true })
    .eq("asistente_id", asistenteId)
  if (error) throw new OperacionError("No se pudieron validar las cuentas de la persona.")
  if ((count || 0) > 0) {
    throw new OperacionError(
      `No se puede eliminar a ${persona.nombre} porque tiene ${count} cuenta(s) registradas. ` +
        "Si ya no participa, desactivala en vez de borrarla."
    )
  }

  return { asistenteId, nombre: persona.nombre, codigo: persona.codigo }
}

export async function eliminarPersona(supabase: any, _actor: ActorErp, asistenteId: string) {
  const v = await previsualizarEliminacionPersona(supabase, asistenteId)

  const { error } = await supabase.from("asistentes").delete().eq("id", asistenteId)
  if (error) {
    if (error.code === "23503") {
      throw new OperacionError(
        "No se puede eliminar la persona porque tiene registros financieros o históricos asociados."
      )
    }
    throw new OperacionError("Error al eliminar: " + error.message)
  }

  return { asistenteId, nombre: v.nombre }
}
