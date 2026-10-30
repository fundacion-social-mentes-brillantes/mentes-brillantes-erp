import type { DbClient } from "@/lib/supabase/types"
import type { Json } from "@/types/database"
import { esAnuladoCompleto } from "@/lib/utils/contable"
import { pesos } from "@/lib/utils/pesos"
import type { ActorErp } from "./abonos"
import { registrarAuditoria } from "./auditoria"
import { OperacionError, exigir, exigirMontoPositivo } from "./errores"
import { crearEgreso, crearVentaExterna } from "./movimientos"
import {
  ESTADOS_TALLER,
  ORIGENES_INSCRIPCION,
  normalizarCorreo,
  normalizarDocumento,
  normalizarEdad,
  normalizarTelefono,
  preguntasGuardadas,
  resumirTaller,
  textoOpcional,
  validarRespuestas,
  validarTaller,
  type DatosTaller,
  type GastoLeido,
  type InscripcionParaResumen,
  type InscripcionTaller,
  type OrigenInscripcion,
  type PagoLeido,
  type Taller,
} from "./talleres-reglas"

export * from "./talleres-reglas"

// Talleres, encuentros y eventos con inscripcion, cada uno con sus cuentas
// aparte: quien se inscribio, cuanto debe pagar, cuanto pago, si vino y que se
// gasto.
//
// La plata no tiene tablas propias: cada pago es una venta externa marcada con
// la inscripcion y cada gasto es un egreso marcado con el taller. Asi entra
// sola a los ingresos del periodo y a la liquidacion de socios, igual que todo
// lo demas, sin tocar esas cuentas.
//
// Inscribirse NO convierte a nadie en asistente del ERP (no hay codigo ni
// ficha). Si la persona ya es asistente, la inscripcion se enlaza a su ficha
// para que alli se vea el taller como registro aparte, sin sumar a su deuda.

// ------------------------------------------------------------- lecturas

const COLUMNAS_INSCRIPCION =
  "id, taller_id, nombre, documento, edad, telefono, correo, respuestas, valor_acordado, estado, asistio, hora_llegada, origen, asistente_id, autorizo_datos_en, comprobante_ruta, comprobante_en, codigo_boleta, notas, creado_en, creado_por, actualizado_en"
const COLUMNAS_PAGO = "id, taller_inscripcion_id, monto, metodo_pago, fecha, estado, notas, creado_en"
const COLUMNAS_GASTO = "id, concepto, monto, categoria, metodo_pago, fecha, estado, notas, taller_id"

async function leerTallerPorId(supabase: DbClient, tallerId: string): Promise<Taller> {
  exigir(tallerId, "Falta el taller.")
  const { data, error } = await supabase.from("talleres").select("*").eq("id", tallerId).maybeSingle()
  if (error) throw new OperacionError("No se pudo leer el taller.")
  if (!data) throw new OperacionError("Ese taller no existe.")
  return data
}

async function leerInscripcion(supabase: DbClient, inscripcionId: string): Promise<InscripcionTaller> {
  exigir(inscripcionId, "Falta la inscripción.")
  const { data, error } = await supabase
    .from("taller_inscripciones")
    .select(COLUMNAS_INSCRIPCION)
    .eq("id", inscripcionId)
    .maybeSingle()
  if (error) throw new OperacionError("No se pudo leer la inscripción.")
  if (!data) throw new OperacionError("Esa inscripción no existe.")
  return data as InscripcionTaller
}

async function pagosDeInscripciones(supabase: DbClient, ids: string[]): Promise<PagoLeido[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from("ventas_externas")
    .select(COLUMNAS_PAGO)
    .in("taller_inscripcion_id", ids)
    .order("fecha", { ascending: true })
  if (error) throw new OperacionError("No se pudieron leer los pagos del taller.")
  return (data ?? []) as PagoLeido[]
}

/** Lo que ya pago un inscrito (sin contar pagos anulados). */
export async function totalPagado(supabase: DbClient, inscripcionId: string): Promise<number> {
  const pagos = await pagosDeInscripciones(supabase, [inscripcionId])
  return pagos.filter((p) => !esAnuladoCompleto(p)).reduce((total, p) => total + Number(p.monto || 0), 0)
}

/** Un taller con todas sus cuentas, para su pagina. Null si no existe. */
export async function cargarTaller(supabase: DbClient, tallerId: string) {
  const { data: taller, error } = await supabase.from("talleres").select("*").eq("id", tallerId).maybeSingle()
  if (error) throw new OperacionError("No se pudo leer el taller.")
  if (!taller) return null

  const [inscripciones, gastos] = await Promise.all([
    supabase
      .from("taller_inscripciones")
      .select(COLUMNAS_INSCRIPCION)
      .eq("taller_id", tallerId)
      .order("creado_en", { ascending: true }),
    supabase.from("egresos").select(COLUMNAS_GASTO).eq("taller_id", tallerId).order("fecha", { ascending: true }),
  ])
  if (inscripciones.error || gastos.error) throw new OperacionError("No se pudieron leer las cuentas del taller.")

  const filasInscripcion = (inscripciones.data ?? []) as InscripcionTaller[]
  const pagos = await pagosDeInscripciones(
    supabase,
    filasInscripcion.map((i) => i.id)
  )
  const resumen = resumirTaller({
    inscripciones: filasInscripcion,
    pagos,
    gastos: (gastos.data ?? []) as GastoLeido[],
  })

  return {
    taller,
    preguntas: preguntasGuardadas(taller.preguntas),
    resumen,
    gastos: (gastos.data ?? []) as GastoLeido[],
  }
}

/** Todos los talleres con sus cifras principales, los mas recientes primero. */
export async function listarTalleres(supabase: DbClient) {
  const { data: talleres, error } = await supabase
    .from("talleres")
    .select("*")
    .order("fecha_inicio", { ascending: false })
    .order("creado_en", { ascending: false })
  if (error) throw new OperacionError("No se pudieron leer los talleres.")
  const lista = (talleres ?? []) as Taller[]
  if (lista.length === 0) return []

  const [inscripciones, pagos, gastos] = await Promise.all([
    supabase.from("taller_inscripciones").select("id, taller_id, valor_acordado, estado, asistio"),
    supabase.from("ventas_externas").select(COLUMNAS_PAGO).not("taller_inscripcion_id", "is", null),
    supabase.from("egresos").select(COLUMNAS_GASTO).not("taller_id", "is", null),
  ])
  if (inscripciones.error || pagos.error || gastos.error) {
    throw new OperacionError("No se pudieron leer las cuentas de los talleres.")
  }

  const filasInscripcion = (inscripciones.data ?? []) as Array<InscripcionParaResumen & { taller_id: string }>
  const tallerDeInscripcion = new Map(filasInscripcion.map((i) => [i.id, i.taller_id]))
  const filasPago = (pagos.data ?? []) as PagoLeido[]
  const filasGasto = (gastos.data ?? []) as Array<GastoLeido & { taller_id: string | null }>

  return lista.map((taller) => ({
    taller,
    resumen: resumirTaller({
      inscripciones: filasInscripcion.filter((i) => i.taller_id === taller.id),
      pagos: filasPago.filter((p) => tallerDeInscripcion.get(p.taller_inscripcion_id || "") === taller.id),
      gastos: filasGasto.filter((g) => g.taller_id === taller.id),
    }),
  }))
}

/**
 * Los talleres de una persona del ERP, para su ficha: los enlazados a ella y,
 * para quien se volvio asistente despues, los inscritos con su misma cedula.
 * Es solo un registro: nada de esto suma a su deuda ni a su estado de cuenta.
 */
export async function talleresDePersona(
  supabase: DbClient,
  persona: { id: string; cedula?: string | null }
) {
  let documento: string | null = null
  try {
    documento = normalizarDocumento(persona.cedula)
  } catch {
    documento = null
  }

  const consultas = [
    supabase.from("taller_inscripciones").select(COLUMNAS_INSCRIPCION).eq("asistente_id", persona.id),
    ...(documento
      ? [supabase.from("taller_inscripciones").select(COLUMNAS_INSCRIPCION).eq("documento", documento)]
      : []),
  ]
  const resultados = await Promise.all(consultas)
  if (resultados.some((r) => r.error)) throw new OperacionError("No se pudieron leer los talleres de la persona.")

  const porId = new Map<string, InscripcionTaller>()
  for (const r of resultados) {
    for (const fila of (r.data ?? []) as InscripcionTaller[]) {
      // Con la cedula solo se suman las que no estan enlazadas a OTRA persona.
      if (fila.asistente_id && fila.asistente_id !== persona.id) continue
      porId.set(fila.id, fila)
    }
  }
  const inscripciones = [...porId.values()].filter((i) => i.estado !== "cancelado")
  if (inscripciones.length === 0) return []

  const tallerIds = [...new Set(inscripciones.map((i) => i.taller_id))]
  const [talleres, pagos] = await Promise.all([
    supabase.from("talleres").select("id, nombre, tipo, fecha_inicio, estado").in("id", tallerIds),
    pagosDeInscripciones(
      supabase,
      inscripciones.map((i) => i.id)
    ),
  ])
  if (talleres.error) throw new OperacionError("No se pudieron leer los talleres de la persona.")
  const tallerPorId = new Map((talleres.data ?? []).map((t) => [t.id, t]))

  const { filas } = resumirTaller({ inscripciones, pagos, gastos: [] })
  return filas
    .map((fila) => ({ ...fila, taller: tallerPorId.get(fila.taller_id) ?? null }))
    .filter((fila) => fila.taller)
    .sort((a, b) => String(b.taller?.fecha_inicio ?? "").localeCompare(String(a.taller?.fecha_inicio ?? "")))
}

// ------------------------------------------------------------- escrituras

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * La auditoria guarda el usuario como uuid: una inscripcion que llega por la
 * invitacion (sin usuario del ERP) no deja fila ahi, pero queda su origen y su
 * fecha en la propia inscripcion.
 */
async function auditarSiHayUsuario(
  supabase: DbClient,
  actor: ActorErp,
  fila: { tabla: string; registroId: string; accion: string; antes?: number | null; despues?: number | null; motivo: string }
) {
  if (!UUID.test(actor.userId || "")) return
  await registrarAuditoria(supabase, {
    tabla: fila.tabla,
    registroId: fila.registroId,
    usuarioId: actor.userId,
    accion: fila.accion,
    valorAnterior: fila.antes ?? null,
    valorNuevo: fila.despues ?? null,
    motivo: fila.motivo,
  })
}

async function exigirSlugLibre(supabase: DbClient, slug: string, excepto?: string) {
  const { data, error } = await supabase.from("talleres").select("id").eq("slug", slug)
  if (error) throw new OperacionError("No se pudo revisar el enlace del taller.")
  if ((data ?? []).some((t) => t.id !== excepto)) {
    throw new OperacionError(`Ya hay otro taller con el enlace «${slug}». Cámbialo un poco (por ejemplo, agrégale el año).`)
  }
}

export async function crearTaller(supabase: DbClient, actor: ActorErp, datos: DatosTaller) {
  const fila = validarTaller(datos)
  await exigirSlugLibre(supabase, fila.slug)

  const { data, error } = await supabase
    .from("talleres")
    .insert([{ ...fila, creado_por: UUID.test(actor.userId || "") ? actor.userId : null }])
    .select("id, slug")
    .single()
  if (error || !data) {
    if (error?.code === "23505") throw new OperacionError(`Ya hay otro taller con el enlace «${fila.slug}».`)
    throw new OperacionError(error?.message || "No se pudo crear el taller.")
  }

  await auditarSiHayUsuario(supabase, actor, {
    tabla: "talleres",
    registroId: data.id,
    accion: "crear_taller",
    despues: fila.precio,
    motivo: `Taller creado: ${fila.nombre}`,
  })
  return { id: data.id, slug: data.slug }
}

export async function editarTaller(supabase: DbClient, actor: ActorErp, tallerId: string, datos: DatosTaller) {
  const actual = await leerTallerPorId(supabase, tallerId)
  const fila = validarTaller(datos)
  if (fila.slug !== actual.slug) await exigirSlugLibre(supabase, fila.slug, tallerId)

  const { error } = await supabase
    .from("talleres")
    .update({ ...fila, actualizado_en: new Date().toISOString() })
    .eq("id", tallerId)
  if (error) {
    if (error.code === "23505") throw new OperacionError(`Ya hay otro taller con el enlace «${fila.slug}».`)
    throw new OperacionError(error.message || "No se pudo guardar el taller.")
  }

  if (Number(actual.precio) !== fila.precio) {
    await auditarSiHayUsuario(supabase, actor, {
      tabla: "talleres",
      registroId: tallerId,
      accion: "editar_precio_taller",
      antes: Number(actual.precio),
      despues: fila.precio,
      motivo: `Cambio del valor del taller ${fila.nombre}. Las inscripciones ya hechas conservan su valor.`,
    })
  }
  return { id: tallerId, slug: fila.slug }
}

/** Abre o cierra inscripciones, o marca el taller como realizado o cancelado. */
export async function cambiarEstadoTaller(supabase: DbClient, tallerId: string, estado: string) {
  const nuevo = ESTADOS_TALLER.find((e) => e === estado)
  exigir(nuevo, "Ese estado no existe.")
  await leerTallerPorId(supabase, tallerId)
  const { error } = await supabase
    .from("talleres")
    .update({ estado: nuevo, actualizado_en: new Date().toISOString() })
    .eq("id", tallerId)
  if (error) throw new OperacionError(error.message || "No se pudo cambiar el estado del taller.")
  return { id: tallerId, estado: nuevo }
}

/** Solo se borra un taller vacio; uno con gente o gastos se marca como cancelado. */
export async function eliminarTaller(supabase: DbClient, actor: ActorErp, tallerId: string) {
  const taller = await leerTallerPorId(supabase, tallerId)
  const [inscripciones, gastos] = await Promise.all([
    supabase.from("taller_inscripciones").select("id", { count: "exact", head: true }).eq("taller_id", tallerId),
    supabase.from("egresos").select("id", { count: "exact", head: true }).eq("taller_id", tallerId),
  ])
  if (inscripciones.error || gastos.error) throw new OperacionError("No se pudo revisar el taller.")
  if ((inscripciones.count ?? 0) > 0 || (gastos.count ?? 0) > 0) {
    throw new OperacionError("Este taller ya tiene personas o gastos: en vez de borrarlo, márcalo como cancelado.")
  }
  const { error } = await supabase.from("talleres").delete().eq("id", tallerId)
  if (error) throw new OperacionError(error.message || "No se pudo borrar el taller.")
  await auditarSiHayUsuario(supabase, actor, {
    tabla: "talleres",
    registroId: tallerId,
    accion: "eliminar_taller",
    antes: Number(taller.precio),
    despues: 0,
    motivo: `Taller borrado (estaba vacío): ${taller.nombre}`,
  })
  return { id: tallerId }
}

/**
 * Busca si la persona ya es asistente del ERP, para enlazar el taller a su
 * ficha. Primero por cedula y, si no, por celular; solo enlaza si hay UNA
 * coincidencia (con dos o mas no adivina).
 */
export async function buscarAsistenteParaEnlazar(
  supabase: DbClient,
  documento: string | null,
  telefono: string | null
): Promise<string | null> {
  if (documento) {
    const { data } = await supabase.from("asistentes").select("id").eq("cedula", documento)
    if ((data ?? []).length === 1) return data![0].id
    if ((data ?? []).length > 1) return null
  }
  if (telefono && telefono.length >= 7) {
    // Se busca por los 4 ultimos numeros (que no suelen llevar espacios en
    // medio) y luego se compara el celular completo ya normalizado.
    const { data } = await supabase
      .from("asistentes")
      .select("id, telefono")
      .ilike("telefono", `%${telefono.slice(-4)}%`)
    const coinciden = (data ?? []).filter((a) => {
      try {
        return normalizarTelefono(a.telefono) === telefono
      } catch {
        return false
      }
    })
    if (coinciden.length === 1) return coinciden[0].id
  }
  return null
}

export type DatosInscripcion = {
  tallerId: string
  nombre: string
  documento?: string | null
  /** Años cumplidos (0 a 120). */
  edad?: number | string | null
  telefono?: string | null
  correo?: string | null
  respuestas?: unknown
  /** Lo que debe pagar. Por defecto el valor del taller; desde la invitacion siempre es ese. */
  valorAcordado?: number | string | null
  origen?: OrigenInscripcion | null
  /** Si el equipo la escogio de la lista de personas del ERP. */
  asistenteId?: string | null
  autorizoDatos?: boolean
  /** Para la puerta: llega e inscribe en el mismo paso. */
  asistio?: boolean
  notas?: string | null
}

export async function inscribirEnTaller(supabase: DbClient, actor: ActorErp, datos: DatosInscripcion) {
  const taller = await leerTallerPorId(supabase, datos.tallerId)
  const origen: OrigenInscripcion = ORIGENES_INSCRIPCION.find((o) => o === datos.origen) ?? "manual"
  const desdeInvitacion = origen === "invitacion"

  if (taller.estado === "cancelado") throw new OperacionError("Este taller está cancelado.")
  if (desdeInvitacion && taller.estado !== "abierto") {
    throw new OperacionError("Las inscripciones de este taller están cerradas.")
  }
  if (desdeInvitacion && !datos.autorizoDatos) {
    throw new OperacionError("Para inscribirte debes autorizar el uso de tus datos para este taller.")
  }

  const nombre = String(datos.nombre ?? "").trim()
  exigir(nombre, "El nombre es obligatorio.")
  if (nombre.length > 120) throw new OperacionError("El nombre es muy largo (máximo 120 caracteres).")
  const documento = normalizarDocumento(datos.documento)
  const edad = normalizarEdad(datos.edad)
  const telefono = normalizarTelefono(datos.telefono)
  const correo = normalizarCorreo(datos.correo)
  if (desdeInvitacion) {
    exigir(documento, "La cédula es obligatoria.")
    exigir(telefono, "El celular es obligatorio.")
  }

  const respuestas = validarRespuestas(preguntasGuardadas(taller.preguntas), datos.respuestas, {
    exigirObligatorias: desdeInvitacion,
  })

  const precio = Number(taller.precio || 0)
  let valorAcordado = precio
  if (!desdeInvitacion && datos.valorAcordado !== null && datos.valorAcordado !== undefined && String(datos.valorAcordado).trim() !== "") {
    valorAcordado = Number(datos.valorAcordado)
    if (!Number.isFinite(valorAcordado) || valorAcordado < 0) {
      throw new OperacionError("El valor a pagar no puede ser negativo.")
    }
  }

  if (documento) {
    const { data: repetidas } = await supabase
      .from("taller_inscripciones")
      .select("id, nombre")
      .eq("taller_id", taller.id)
      .eq("documento", documento)
      .neq("estado", "cancelado")
    if ((repetidas ?? []).length > 0) {
      throw new OperacionError(
        desdeInvitacion
          ? "Esa cédula ya está inscrita en este taller. Si perdiste tu boleta, escríbenos y te la reenviamos."
          : `Esa cédula ya está inscrita en este taller (${repetidas![0].nombre}).`
      )
    }
  }

  if (desdeInvitacion && taller.cupo) {
    const { count } = await supabase
      .from("taller_inscripciones")
      .select("id", { count: "exact", head: true })
      .eq("taller_id", taller.id)
      .neq("estado", "cancelado")
    if ((count ?? 0) >= taller.cupo) throw new OperacionError("Se llenaron los cupos de este taller.")
  }

  const asistenteId = datos.asistenteId || (await buscarAsistenteParaEnlazar(supabase, documento, telefono))
  const ahora = new Date().toISOString()
  const notas = textoOpcional(datos.notas, 1000, "La nota")

  const { data, error } = await supabase
    .from("taller_inscripciones")
    .insert([
      {
        taller_id: taller.id,
        nombre,
        documento,
        edad,
        telefono,
        correo,
        respuestas: respuestas as Json,
        valor_acordado: valorAcordado,
        origen,
        asistente_id: asistenteId,
        autorizo_datos_en: datos.autorizoDatos ? ahora : null,
        asistio: Boolean(datos.asistio),
        hora_llegada: datos.asistio ? ahora : null,
        notas,
        creado_por: UUID.test(actor.userId || "") ? actor.userId : null,
      },
    ])
    .select("id, codigo_boleta")
    .single()
  if (error || !data) {
    if (error?.code === "23505") throw new OperacionError("Esa cédula ya está inscrita en este taller.")
    throw new OperacionError(error?.message || "No se pudo guardar la inscripción.")
  }

  await auditarSiHayUsuario(supabase, actor, {
    tabla: "taller_inscripciones",
    registroId: data.id,
    accion: "crear_inscripcion_taller",
    despues: valorAcordado,
    motivo: `${nombre} en ${taller.nombre}`,
  })
  return { id: data.id, codigoBoleta: data.codigo_boleta, valorAcordado, asistenteId, taller }
}

export type CambiosInscripcion = {
  nombre?: string
  documento?: string | null
  edad?: number | string | null
  telefono?: string | null
  correo?: string | null
  valorAcordado?: number | string | null
  asistenteId?: string | null
  notas?: string | null
}

export async function editarInscripcion(
  supabase: DbClient,
  actor: ActorErp,
  inscripcionId: string,
  cambios: CambiosInscripcion
) {
  const actual = await leerInscripcion(supabase, inscripcionId)
  const fila: Partial<InscripcionTaller> = {}

  if (cambios.nombre !== undefined) {
    const nombre = String(cambios.nombre ?? "").trim()
    exigir(nombre, "El nombre es obligatorio.")
    if (nombre.length > 120) throw new OperacionError("El nombre es muy largo (máximo 120 caracteres).")
    fila.nombre = nombre
  }
  if (cambios.documento !== undefined) {
    const documento = normalizarDocumento(cambios.documento)
    if (documento && documento !== actual.documento && actual.estado !== "cancelado") {
      const { data: repetidas } = await supabase
        .from("taller_inscripciones")
        .select("id")
        .eq("taller_id", actual.taller_id)
        .eq("documento", documento)
        .neq("estado", "cancelado")
      if ((repetidas ?? []).some((r) => r.id !== inscripcionId)) {
        throw new OperacionError("Esa cédula ya está inscrita en este taller.")
      }
    }
    fila.documento = documento
  }
  if (cambios.edad !== undefined) fila.edad = normalizarEdad(cambios.edad)
  if (cambios.telefono !== undefined) fila.telefono = normalizarTelefono(cambios.telefono)
  if (cambios.correo !== undefined) fila.correo = normalizarCorreo(cambios.correo)
  if (cambios.notas !== undefined) fila.notas = textoOpcional(cambios.notas, 1000, "La nota")
  if (cambios.asistenteId !== undefined) fila.asistente_id = cambios.asistenteId || null

  let valorAnterior: number | null = null
  if (cambios.valorAcordado !== undefined && cambios.valorAcordado !== null && String(cambios.valorAcordado).trim() !== "") {
    const valor = Number(cambios.valorAcordado)
    if (!Number.isFinite(valor) || valor < 0) throw new OperacionError("El valor a pagar no puede ser negativo.")
    if (valor !== Number(actual.valor_acordado)) {
      const pagado = await totalPagado(supabase, inscripcionId)
      if (valor < pagado) {
        throw new OperacionError(
          `Ya pagó ${pesos(pagado)}: el valor a pagar no puede quedar por debajo de eso. Si se le devolvió plata, anula primero ese pago.`
        )
      }
      valorAnterior = Number(actual.valor_acordado)
      fila.valor_acordado = valor
    }
  }

  if (Object.keys(fila).length === 0) return { id: inscripcionId }

  const { error } = await supabase
    .from("taller_inscripciones")
    .update({ ...fila, actualizado_en: new Date().toISOString() })
    .eq("id", inscripcionId)
  if (error) {
    if (error.code === "23505") throw new OperacionError("Esa cédula ya está inscrita en este taller.")
    throw new OperacionError(error.message || "No se pudo guardar la inscripción.")
  }

  if (valorAnterior !== null) {
    await auditarSiHayUsuario(supabase, actor, {
      tabla: "taller_inscripciones",
      registroId: inscripcionId,
      accion: "editar_valor_inscripcion_taller",
      antes: valorAnterior,
      despues: fila.valor_acordado ?? null,
      motivo: `Cambio del valor a pagar de ${fila.nombre ?? actual.nombre}`,
    })
  }
  return { id: inscripcionId }
}

/** Llego (o no) al taller. No toca plata. */
export async function marcarAsistencia(supabase: DbClient, inscripcionId: string, asistio: boolean) {
  const actual = await leerInscripcion(supabase, inscripcionId)
  if (actual.estado === "cancelado") throw new OperacionError("Esa inscripción está cancelada.")
  const horaLlegada = asistio ? actual.hora_llegada || new Date().toISOString() : null
  const { error } = await supabase
    .from("taller_inscripciones")
    .update({ asistio, hora_llegada: horaLlegada, actualizado_en: new Date().toISOString() })
    .eq("id", inscripcionId)
  if (error) throw new OperacionError(error.message || "No se pudo marcar la asistencia.")
  return { id: inscripcionId, asistio, horaLlegada }
}

// ------------------------------------------------------------- la entrada (QR de la boleta) en la puerta

/**
 * La entrada de una persona, leida del QR de su boleta: su taller, su numero de
 * entrada (el mismo que ve en su boleta), si ya llego y como va su pago. Null si
 * el codigo no es de ninguna inscripcion.
 */
export async function entradaPorCodigo(supabase: DbClient, codigo: string) {
  if (!/^[0-9a-f]{32}$/.test(codigo)) return null
  const { data, error } = await supabase
    .from("taller_inscripciones")
    .select(COLUMNAS_INSCRIPCION)
    .eq("codigo_boleta", codigo)
    .maybeSingle()
  if (error) throw new OperacionError("No se pudo leer la entrada.")
  if (!data) return null
  const inscripcion = data as InscripcionTaller

  const [tallerLeido, pagos, anteriores] = await Promise.all([
    supabase.from("talleres").select("id, nombre, slug, tipo, fecha_inicio, lugar").eq("id", inscripcion.taller_id).maybeSingle(),
    pagosDeInscripciones(supabase, [inscripcion.id]),
    // El numero de entrada es el puesto entre los que siguen inscritos, como en la boleta.
    supabase
      .from("taller_inscripciones")
      .select("id")
      .eq("taller_id", inscripcion.taller_id)
      .neq("estado", "cancelado")
      .lte("creado_en", inscripcion.creado_en),
  ])
  if (tallerLeido.error || anteriores.error) throw new OperacionError("No se pudo leer la entrada.")
  if (!tallerLeido.data) return null

  const [fila] = resumirTaller({ inscripciones: [inscripcion], pagos, gastos: [] }).filas
  const cancelada = inscripcion.estado === "cancelado"
  return {
    taller: tallerLeido.data,
    inscripcion: {
      id: inscripcion.id,
      nombre: inscripcion.nombre,
      documento: inscripcion.documento,
      edad: inscripcion.edad,
      estado: inscripcion.estado,
      asistio: inscripcion.asistio,
      horaLlegada: inscripcion.hora_llegada,
    },
    numero: cancelada ? null : (anteriores.data ?? []).length,
    cancelada,
    valor: Number(inscripcion.valor_acordado || 0),
    pagado: fila.pagado,
    pendiente: fila.pendiente,
    estadoPago: fila.estadoPago,
  }
}

export type EntradaTaller = NonNullable<Awaited<ReturnType<typeof entradaPorCodigo>>>

/** Cuantos de los inscritos de un taller (sin contar los cancelados) ya llegaron. */
export async function conteoLlegadas(supabase: DbClient, tallerId: string) {
  const { data, error } = await supabase
    .from("taller_inscripciones")
    .select("id, asistio")
    .eq("taller_id", tallerId)
    .neq("estado", "cancelado")
  if (error) throw new OperacionError("No se pudo contar quién llegó.")
  const filas = data ?? []
  return { llegaron: filas.filter((f) => f.asistio).length, total: filas.length }
}

/**
 * Registra la llegada de quien muestra el QR de su boleta. Si ya habia llegado
 * no cambia nada y lo dice, con la hora de entonces: asi nadie entra dos veces
 * con la misma boleta. Con `tallerId`, la entrada tiene que ser de ese taller
 * (en la puerta de un taller no vale la boleta de otro).
 */
export async function registrarLlegadaPorCodigo(supabase: DbClient, codigo: string, opciones: { tallerId?: string | null } = {}) {
  const entrada = await entradaPorCodigo(supabase, codigo)
  if (!entrada) throw new OperacionError("Esa entrada no existe. Revisa que sea la boleta de un taller de la fundación.")
  if (opciones.tallerId && entrada.taller.id !== opciones.tallerId) {
    throw new OperacionError(`Esa entrada es de otro taller: ${entrada.taller.nombre}.`)
  }
  if (entrada.cancelada) throw new OperacionError(`La inscripción de ${entrada.inscripcion.nombre} está cancelada.`)

  const yaHabiaLlegado = entrada.inscripcion.asistio
  const horaLlegada = yaHabiaLlegado
    ? entrada.inscripcion.horaLlegada
    : (await marcarAsistencia(supabase, entrada.inscripcion.id, true)).horaLlegada
  const conteo = await conteoLlegadas(supabase, entrada.taller.id)

  return {
    yaHabiaLlegado,
    horaLlegada,
    inscripcionId: entrada.inscripcion.id,
    nombre: entrada.inscripcion.nombre,
    numero: entrada.numero,
    pendiente: entrada.pendiente,
    tallerId: entrada.taller.id,
    tallerNombre: entrada.taller.nombre,
    ...conteo,
  }
}

export type LlegadaRegistrada = Awaited<ReturnType<typeof registrarLlegadaPorCodigo>>

/**
 * Cancela una inscripcion (no vendra y no debe nada). Si ya pago algo no se
 * deja: o se le devolvio la plata (y entonces se anula ese pago primero) o la
 * fundacion se la quedo (y entonces sigue inscrita y queda como que no vino).
 */
export async function cancelarInscripcion(
  supabase: DbClient,
  actor: ActorErp,
  inscripcionId: string,
  motivo?: string | null
) {
  const actual = await leerInscripcion(supabase, inscripcionId)
  if (actual.estado === "cancelado") return { id: inscripcionId }
  const pagado = await totalPagado(supabase, inscripcionId)
  if (pagado > 0) {
    throw new OperacionError(
      `Ya pagó ${pesos(pagado)}. Si se le devolvió la plata, anula primero ese pago; si no, déjala inscrita y márcala como que no vino.`
    )
  }

  const { error } = await supabase
    .from("taller_inscripciones")
    .update({ estado: "cancelado", asistio: false, hora_llegada: null, actualizado_en: new Date().toISOString() })
    .eq("id", inscripcionId)
  if (error) throw new OperacionError(error.message || "No se pudo cancelar la inscripción.")

  await auditarSiHayUsuario(supabase, actor, {
    tabla: "taller_inscripciones",
    registroId: inscripcionId,
    accion: "cancelar_inscripcion_taller",
    antes: Number(actual.valor_acordado),
    despues: 0,
    motivo: String(motivo ?? "").trim() || `Inscripción cancelada: ${actual.nombre}`,
  })
  return { id: inscripcionId }
}

export type PagoTallerParams = {
  inscripcionId: string
  monto: number | string
  metodoPago: string
  fecha: string
  notas?: string | null
}

/**
 * Registra un pago (o abono) de un inscrito. Entra como venta externa marcada
 * con la inscripcion: cuenta como ingreso del periodo y se reparte entre los
 * socios como lo demas. No se acepta mas de lo que falta, porque un inscrito
 * no tiene saldo a favor donde guardar el sobrante.
 */
export async function registrarPagoTaller(supabase: DbClient, actor: ActorErp, params: PagoTallerParams) {
  const inscripcion = await leerInscripcion(supabase, params.inscripcionId)
  if (inscripcion.estado === "cancelado") throw new OperacionError("Esa inscripción está cancelada.")
  const taller = await leerTallerPorId(supabase, inscripcion.taller_id)

  const monto = exigirMontoPositivo(params.monto)
  const pagado = await totalPagado(supabase, inscripcion.id)
  const pendiente = Math.max(0, Number(inscripcion.valor_acordado || 0) - pagado)
  if (pendiente <= 0) throw new OperacionError(`${inscripcion.nombre} ya pagó todo el taller.`)
  if (monto > pendiente) {
    throw new OperacionError(
      `El pago supera lo que falta (${pesos(pendiente)}). Registra solo lo que falta, o sube primero el valor a pagar de esta persona.`
    )
  }

  const venta = await crearVentaExterna(supabase, actor, {
    concepto: `${taller.nombre} · Inscripción`,
    compradorNombre: inscripcion.nombre,
    monto,
    metodoPago: params.metodoPago,
    fecha: params.fecha,
    notas: params.notas ?? null,
    tallerInscripcionId: inscripcion.id,
  })
  return { ...venta, pagadoDespues: pagado + monto, pendienteDespues: pendiente - monto }
}

export type GastoTallerParams = {
  tallerId: string
  concepto: string
  monto: number | string
  categoria: string
  metodoPago: string
  fecha: string
  notas?: string | null
}

/** Un gasto del taller (refrigerios, materiales, el pago a un tallerista externo...). Es un egreso marcado con el taller. */
export async function registrarGastoTaller(supabase: DbClient, actor: ActorErp, params: GastoTallerParams) {
  const taller = await leerTallerPorId(supabase, params.tallerId)
  const concepto = String(params.concepto ?? "").trim()
  exigir(concepto, "Escribe en qué se gastó.")
  return crearEgreso(supabase, actor, {
    concepto: `${taller.nombre} · ${concepto}`,
    monto: Number(params.monto),
    categoria: params.categoria,
    metodoPago: params.metodoPago,
    fecha: params.fecha,
    notas: params.notas ?? null,
    tallerId: taller.id,
  })
}
