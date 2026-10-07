import type { DbClient, TablesInsert, TablesUpdate } from "@/lib/supabase/types"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import { OperacionError, SinCambiosError, exigir, exigirFechaIso } from "./errores"
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

/**
 * Cambios a una persona ya registrada. Cada campo tiene tres estados:
 * `undefined` = no se toca, `null` o "" = se borra, y un valor = se cambia.
 *
 * Antes la edicion reescribia la fila entera: un campo que no se mandaba
 * quedaba en NULL, y como el rol admin siempre escribia las fechas, editar el
 * telefono de alguien le borraba la fecha de registro y la de inicio de
 * proceso sin avisar.
 */
export type CambiosPersona = Partial<DatosPersona>

const CAMPOS_TEXTO = ["nombre", "cedula", "correo", "telefono", "codigo"] as const
const CAMPOS_FECHA = ["fechaRegistro", "fechaInicioProceso"] as const

const COLUMNA = {
  nombre: "nombre",
  cedula: "cedula",
  correo: "correo",
  telefono: "telefono",
  codigo: "codigo",
  fechaRegistro: "fecha_registro",
  fechaInicioProceso: "fecha_inicio_proceso",
} as const satisfies Record<keyof DatosPersona, keyof TablesUpdate<"asistentes">>

const esCampoFecha = (campo: keyof DatosPersona): campo is (typeof CAMPOS_FECHA)[number] =>
  (CAMPOS_FECHA as readonly string[]).includes(campo)

function limpiar(v: unknown): string | null {
  const s = String(v ?? "").trim()
  return s ? s : null
}

function fechaOpcional(v: unknown, etiqueta: string): string | null {
  const s = limpiar(v)
  return s ? exigirFechaIso(s, etiqueta) : null
}

function traducirError(error: { code?: string; message?: string } | null): OperacionError {
  if (error?.code === "23505") {
    return new OperacionError("Ya existe una persona con esa cedula o codigo.")
  }
  return new OperacionError(error?.message || "No se pudo guardar la persona.")
}

/**
 * El siguiente codigo libre, igual que el que la web propone al abrir el
 * formulario. El codigo es lo que comparten el ERP y la agenda: una persona sin
 * codigo no se puede cruzar con sus sesiones.
 */
export async function siguienteCodigoPersona(supabase: DbClient): Promise<string> {
  const { data, error } = await supabase.from("asistentes").select("codigo")
  if (error) throw new OperacionError("No se pudo calcular el siguiente codigo.")
  const numeros = (data || [])
    .map((fila) => Number.parseInt(String(fila.codigo ?? ""), 10))
    .filter((n) => Number.isFinite(n))
  return String((numeros.length ? Math.max(...numeros) : 0) + 1)
}

/**
 * Solo `admin` puede fijar fechas a mano (misma regla que el formulario de la
 * web). La fecha de registro, si nadie la indica, es la de hoy: dejarla vacia
 * escondia a la persona de los reportes de altas.
 */
export async function crearPersona(supabase: DbClient, actor: ActorErp, datos: DatosPersona) {
  const nombre = String(datos.nombre || "").trim()
  exigir(nombre, "El nombre es obligatorio.")

  const quiereFechas = limpiar(datos.fechaRegistro) || limpiar(datos.fechaInicioProceso)
  if (quiereFechas && actor.role !== "admin") {
    throw new OperacionError("Solo un administrador puede fijar las fechas de registro o de inicio de proceso.")
  }

  const fila: TablesInsert<"asistentes"> = {
    nombre,
    cedula: limpiar(datos.cedula),
    correo: limpiar(datos.correo),
    telefono: limpiar(datos.telefono),
    codigo: limpiar(datos.codigo) ?? (await siguienteCodigoPersona(supabase)),
    fecha_registro: fechaOpcional(datos.fechaRegistro, "La fecha de registro") ?? fechaHoyBogota(),
    fecha_inicio_proceso: fechaOpcional(datos.fechaInicioProceso, "La fecha de inicio de proceso"),
  }

  const { data, error } = await supabase
    .from("asistentes")
    .insert([fila])
    .select("id, nombre, codigo, fecha_registro")
    .single()

  if (error || !data) throw traducirError(error)
  return {
    id: data.id,
    nombre: data.nombre,
    codigo: data.codigo,
    fechaRegistro: data.fecha_registro,
  }
}

async function leerPersonaCompleta(supabase: DbClient, asistenteId: string) {
  const { data, error } = await supabase
    .from("asistentes")
    .select("id, nombre, codigo, cedula, correo, telefono, fecha_registro, fecha_inicio_proceso, activo")
    .eq("id", asistenteId)
    .single()
  if (error || !data) throw new OperacionError("No encontre esa persona.")
  return data
}

export type CambioCampo = { antes: string | null; despues: string | null }

/**
 * Calcula que cambiaria, sin escribir. Solo aparecen los campos que de verdad
 * cambian; si no cambia nada, se avisa en vez de "guardar" en vacio.
 */
export async function previsualizarEdicionPersona(
  supabase: DbClient,
  actor: ActorErp,
  asistenteId: string,
  cambios: CambiosPersona
) {
  exigir(asistenteId, "Falta indicar a quien se edita.")
  const actual = await leerPersonaCompleta(supabase, asistenteId)

  const tocaFechas = CAMPOS_FECHA.some((campo) => cambios[campo] !== undefined)
  if (tocaFechas && actor.role !== "admin") {
    throw new OperacionError("Solo un administrador puede cambiar las fechas de registro o de inicio de proceso.")
  }

  const resultado: Partial<Record<keyof DatosPersona, CambioCampo>> = {}
  for (const campo of [...CAMPOS_TEXTO, ...CAMPOS_FECHA]) {
    if (cambios[campo] === undefined) continue
    const despues = esCampoFecha(campo) ? fechaOpcional(cambios[campo], "La fecha") : limpiar(cambios[campo])
    const antes = actual[COLUMNA[campo]] ?? null
    if (campo === "nombre" && !despues) throw new OperacionError("El nombre no puede quedar vacio.")
    if ((antes ?? null) !== (despues ?? null)) resultado[campo] = { antes, despues }
  }

  if (Object.keys(resultado).length === 0) {
    throw new SinCambiosError(`No hay nada que cambiar: los datos de ${actual.nombre} ya son esos.`)
  }

  return { asistenteId, nombreActual: actual.nombre, codigoActual: actual.codigo, cambios: resultado }
}

export async function editarPersona(
  supabase: DbClient,
  actor: ActorErp,
  asistenteId: string,
  cambios: CambiosPersona
) {
  const previa = await previsualizarEdicionPersona(supabase, actor, asistenteId, cambios)

  // Solo se escriben las columnas que cambian: lo demas queda como estaba.
  const payload: TablesUpdate<"asistentes"> = {}
  for (const campo of Object.keys(previa.cambios) as Array<keyof DatosPersona>) {
    const despues = previa.cambios[campo]?.despues ?? null
    if (campo === "nombre") {
      // El nombre ya se valido como no vacio en la previsualizacion.
      if (despues) payload.nombre = despues
    } else {
      payload[COLUMNA[campo]] = despues
    }
  }

  const { error } = await supabase.from("asistentes").update(payload).eq("id", asistenteId)
  if (error) throw traducirError(error)
  return {
    id: asistenteId,
    nombre: previa.cambios.nombre?.despues ?? previa.nombreActual,
    camposCambiados: Object.keys(previa.cambios),
  }
}

export async function buscarPersonaPorId(supabase: DbClient, asistenteId: string) {
  const { data, error } = await supabase
    .from("asistentes")
    .select("id, nombre, codigo, cedula, correo, telefono, activo")
    .eq("id", asistenteId)
    .single()
  if (error || !data) throw new OperacionError("No encontre esa persona.")
  return data
}

/** Activar o desactivar una persona (no borra nada; deja de aparecer activa). */
export async function cambiarEstadoPersona(supabase: DbClient, _actor: ActorErp, asistenteId: string, activo: boolean) {
  exigir(asistenteId, "Falta indicar la persona.")
  const { error } = await supabase.from("asistentes").update({ activo }).eq("id", asistenteId)
  if (error) throw new OperacionError(error.message || "No se pudo cambiar el estado de la persona.")
  return { id: asistenteId, activo }
}

/**
 * Borrado de persona. Solo procede si NO tiene cuentas: si las tuviera, la
 * cascada arrastraria pagos y sesiones y desapareceria dinero del historial.
 */
export async function previsualizarEliminacionPersona(supabase: DbClient, asistenteId: string) {
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

export async function eliminarPersona(supabase: DbClient, _actor: ActorErp, asistenteId: string) {
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
