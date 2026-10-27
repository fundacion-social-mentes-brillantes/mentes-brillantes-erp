import { createHmac } from "node:crypto"
import type { DbClient } from "@/lib/supabase/types"
import { OperacionError } from "@/lib/operaciones/errores"
import { inscribirEnTaller, preguntasGuardadas, resumirTaller, type Taller } from "@/lib/operaciones/talleres"
import { esAnuladoCompleto } from "@/lib/utils/contable"
import { objeto } from "@/lib/utils/lectura"
import { secretoCoincide } from "@/lib/seguridad/secretos"

// Lo que la pagina de invitaciones (talleres.gimnasioemocionalmb.com) puede
// pedirle al ERP, siempre desde SU servidor y con la clave compartida:
// leer un taller, inscribir a alguien, ver una boleta y subir un comprobante.
//
// Nunca devuelve datos de otras personas ni cuentas del taller: solo lo que la
// invitacion necesita mostrar.

export function secretoTalleresValido(req: Request): boolean {
  return secretoCoincide(req.headers.get("x-talleres-secret"), process.env.TALLERES_SHARED_SECRET)
}

export const CABECERAS_SIN_CACHE = { "Cache-Control": "no-store" } as const

/** Dirección pública de las invitaciones (Cloudflare Pages). */
export function urlSitioTalleres(): string {
  return (process.env.TALLERES_SITIO_URL || "https://talleres.gimnasioemocionalmb.com").replace(/\/+$/, "")
}

/**
 * Firma de la vista previa de un borrador: HMAC-SHA256 de «vista:<slug>» con la clave
 * compartida, en hex (32 caracteres). La página de invitaciones la comprueba antes de
 * mostrar un taller que no está abierto. Sin clave configurada no hay vista previa.
 */
export function firmaVistaPrevia(slug: string): string | null {
  const clave = process.env.TALLERES_SHARED_SECRET
  if (!clave) return null
  return createHmac("sha256", clave).update(`vista:${slug}`).digest("hex").slice(0, 32)
}

/** El enlace de la invitación para el equipo: con firma si el taller aún no está abierto. */
export function enlaceInvitacion(slug: string, estado: string): string {
  const base = `${urlSitioTalleres()}/${slug}/`
  if (estado === "abierto") return base
  const firma = firmaVistaPrevia(slug)
  return firma ? `${base}?vista=${firma}` : base
}

export function respuestaNoAutorizada() {
  return Response.json({ error: "no_autorizado" }, { status: 401, headers: CABECERAS_SIN_CACHE })
}

/** Quien inscribe desde la invitacion: no es un usuario del ERP. */
const ACTOR_INVITACION = { userId: "invitacion" }

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const CODIGO = /^[0-9a-f]{32}$/

async function contarActivas(supabase: DbClient, tallerId: string) {
  const { count } = await supabase
    .from("taller_inscripciones")
    .select("id", { count: "exact", head: true })
    .eq("taller_id", tallerId)
    .neq("estado", "cancelado")
  return count ?? 0
}

function tallerParaInvitacion(taller: Taller, inscritos: number) {
  const restantes = taller.cupo ? Math.max(0, taller.cupo - inscritos) : null
  return {
    slug: taller.slug,
    nombre: taller.nombre,
    tipo: taller.tipo,
    descripcion: taller.descripcion,
    fechaInicio: taller.fecha_inicio,
    lugar: taller.lugar,
    precio: Number(taller.precio || 0),
    cupo: taller.cupo,
    cuposRestantes: restantes,
    estado: taller.estado,
    inscripcionesAbiertas: taller.estado === "abierto" && (restantes === null || restantes > 0),
    instruccionesPago: taller.instrucciones_pago,
    preguntas: preguntasGuardadas(taller.preguntas),
  }
}

/** El taller como lo ve la invitacion. Los borradores solo se ven en vista previa. */
export async function tallerPublico(supabase: DbClient, slug: string, opciones: { vistaPrevia?: boolean } = {}) {
  if (!SLUG.test(slug)) return null
  const { data: taller } = await supabase.from("talleres").select("*").eq("slug", slug).maybeSingle()
  if (!taller) return null
  if (taller.estado === "borrador" && !opciones.vistaPrevia) return null
  return tallerParaInvitacion(taller, await contarActivas(supabase, taller.id))
}

export async function inscribirDesdeInvitacion(supabase: DbClient, slug: string, cuerpo: unknown) {
  if (!SLUG.test(slug)) throw new OperacionError("Ese taller no existe.")
  const { data: taller } = await supabase.from("talleres").select("id").eq("slug", slug).maybeSingle()
  if (!taller) throw new OperacionError("Ese taller no existe.")

  const datos = objeto(cuerpo)
  const texto = (campo: string, maximo = 200) => String(datos[campo] ?? "").trim().slice(0, maximo)
  const inscrita = await inscribirEnTaller(supabase, ACTOR_INVITACION, {
    tallerId: taller.id,
    nombre: texto("nombre", 120),
    documento: texto("documento", 30) || null,
    telefono: texto("telefono", 30) || null,
    correo: texto("correo", 160) || null,
    respuestas: objeto(datos.respuestas),
    origen: "invitacion",
    autorizoDatos: datos.autorizoDatos === true,
  })

  return {
    codigoBoleta: inscrita.codigoBoleta,
    valor: inscrita.valorAcordado,
    instruccionesPago: inscrita.taller.instrucciones_pago,
  }
}

/** La boleta de una persona: su taller, su nombre y como va su pago. Nada mas. */
export async function boletaPorCodigo(supabase: DbClient, codigo: string) {
  if (!CODIGO.test(codigo)) return null
  const { data: inscripcion } = await supabase
    .from("taller_inscripciones")
    .select("id, taller_id, nombre, valor_acordado, estado, asistio, comprobante_ruta, creado_en")
    .eq("codigo_boleta", codigo)
    .maybeSingle()
  if (!inscripcion) return null

  const [{ data: taller }, { data: pagos }, { data: anteriores }] = await Promise.all([
    supabase.from("talleres").select("nombre, slug, tipo, fecha_inicio, lugar, instrucciones_pago").eq("id", inscripcion.taller_id).maybeSingle(),
    supabase.from("ventas_externas").select("id, taller_inscripcion_id, monto, metodo_pago, fecha, estado, notas").eq("taller_inscripcion_id", inscripcion.id),
    supabase
      .from("taller_inscripciones")
      .select("id")
      .eq("taller_id", inscripcion.taller_id)
      .neq("estado", "cancelado")
      .lte("creado_en", inscripcion.creado_en),
  ])
  if (!taller) return null

  const [fila] = resumirTaller({
    inscripciones: [inscripcion],
    pagos: (pagos ?? []).filter((p) => !esAnuladoCompleto(p)),
    gastos: [],
  }).filas

  return {
    taller,
    nombre: inscripcion.nombre,
    numero: inscripcion.estado === "cancelado" ? null : (anteriores ?? []).length,
    cancelada: inscripcion.estado === "cancelado",
    asistio: inscripcion.asistio,
    valor: Number(inscripcion.valor_acordado || 0),
    pagado: fila.pagado,
    pendiente: fila.pendiente,
    estadoPago: fila.estadoPago,
    comprobanteSubido: Boolean(inscripcion.comprobante_ruta),
  }
}

// ------------------------------------------------------------ comprobantes

export const TAMANO_MAXIMO_COMPROBANTE = 5 * 1024 * 1024

/**
 * El tipo real del archivo, mirando sus primeros bytes (no el nombre ni lo
 * que diga el navegador). Solo fotos y PDF; cualquier otra cosa se rechaza.
 */
export function tipoDeComprobante(bytes: Uint8Array): { tipo: string; extension: string } | null {
  const empieza = (...valores: number[]) => valores.every((v, i) => bytes[i] === v)
  const texto = (desde: number, hasta: number) => String.fromCharCode(...bytes.slice(desde, hasta))
  if (empieza(0xff, 0xd8, 0xff)) return { tipo: "image/jpeg", extension: "jpg" }
  if (empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { tipo: "image/png", extension: "png" }
  if (texto(0, 4) === "RIFF" && texto(8, 12) === "WEBP") return { tipo: "image/webp", extension: "webp" }
  if (texto(0, 5) === "%PDF-") return { tipo: "application/pdf", extension: "pdf" }
  if (texto(4, 8) === "ftyp") {
    const marca = texto(8, 12)
    if (["heic", "heix", "hevc", "heim", "heis"].includes(marca)) return { tipo: "image/heic", extension: "heic" }
    if (["mif1", "msf1"].includes(marca)) return { tipo: "image/heif", extension: "heif" }
  }
  return null
}

/**
 * Guarda el comprobante de pago de una boleta. Si ya habia uno, lo reemplaza
 * y borra el anterior. El equipo lo revisa en el ERP y registra el pago: subir
 * el comprobante NO marca nada como pagado.
 */
export async function guardarComprobante(supabase: DbClient, codigo: string, archivo: File) {
  if (!CODIGO.test(codigo)) throw new OperacionError("Esa boleta no existe.")
  const { data: inscripcion } = await supabase
    .from("taller_inscripciones")
    .select("id, taller_id, estado, comprobante_ruta")
    .eq("codigo_boleta", codigo)
    .maybeSingle()
  if (!inscripcion) throw new OperacionError("Esa boleta no existe.")
  if (inscripcion.estado === "cancelado") throw new OperacionError("Esa inscripción está cancelada.")

  if (archivo.size === 0) throw new OperacionError("El archivo está vacío.")
  if (archivo.size > TAMANO_MAXIMO_COMPROBANTE) throw new OperacionError("El archivo es muy pesado: máximo 5 MB.")
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const tipo = tipoDeComprobante(bytes)
  if (!tipo) throw new OperacionError("Sube una foto (JPG, PNG, WEBP o HEIC) o un PDF del comprobante.")

  const ruta = `${inscripcion.taller_id}/${inscripcion.id}/${Date.now()}.${tipo.extension}`
  const almacen = supabase.storage.from("talleres-comprobantes")
  const { error: errorSubida } = await almacen.upload(ruta, bytes, { contentType: tipo.tipo, upsert: false })
  if (errorSubida) throw new OperacionError("No se pudo guardar el comprobante. Intenta de nuevo.")

  const { error } = await supabase
    .from("taller_inscripciones")
    .update({ comprobante_ruta: ruta, comprobante_en: new Date().toISOString(), actualizado_en: new Date().toISOString() })
    .eq("id", inscripcion.id)
  if (error) {
    await almacen.remove([ruta])
    throw new OperacionError("No se pudo guardar el comprobante. Intenta de nuevo.")
  }
  if (inscripcion.comprobante_ruta) await almacen.remove([inscripcion.comprobante_ruta])
  return { guardado: true }
}
