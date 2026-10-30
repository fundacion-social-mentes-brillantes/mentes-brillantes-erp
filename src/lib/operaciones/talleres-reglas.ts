import type { Json, Tables } from "@/types/database"
import { esAnuladoCompleto } from "@/lib/utils/contable"
import { OperacionError, exigir } from "./errores"

// Reglas de los talleres que no tocan la base: validar un taller y sus
// preguntas, limpiar los datos de una persona y sacar las cuentas. Viven aparte
// de talleres.ts para que las pantallas del navegador las usen sin cargar el
// codigo del servidor.

export const ESTADOS_TALLER = ["borrador", "abierto", "cerrado", "realizado", "cancelado"] as const
export type EstadoTaller = (typeof ESTADOS_TALLER)[number]

export const ETIQUETA_ESTADO_TALLER: Record<EstadoTaller, string> = {
  borrador: "Borrador",
  abierto: "Inscripciones abiertas",
  cerrado: "Inscripciones cerradas",
  realizado: "Realizado",
  cancelado: "Cancelado",
}

export const TIPOS_PREGUNTA = ["texto", "opciones", "si_no"] as const
export type TipoPregunta = (typeof TIPOS_PREGUNTA)[number]

/** Una pregunta propia del formulario de inscripcion de un taller. */
export type PreguntaTaller = {
  id: string
  texto: string
  tipo: TipoPregunta
  opciones?: string[]
  obligatoria: boolean
}

export const ORIGENES_INSCRIPCION = ["manual", "invitacion", "puerta"] as const
export type OrigenInscripcion = (typeof ORIGENES_INSCRIPCION)[number]

export type Taller = Tables<"talleres">
export type InscripcionTaller = Tables<"taller_inscripciones">

const MAX_PREGUNTAS = 20
const MAX_OPCIONES = 12

// ------------------------------------------------------------ validaciones

export function textoOpcional(valor: unknown, maximo: number, etiqueta: string): string | null {
  const limpio = String(valor ?? "").trim()
  if (!limpio) return null
  if (limpio.length > maximo) throw new OperacionError(`${etiqueta} es muy largo (máximo ${maximo} caracteres).`)
  return limpio
}

/** Cedula sin puntos, espacios ni guiones: "1.020.304" y "1020304" son la misma. */
export function normalizarDocumento(valor: unknown): string | null {
  const limpio = String(valor ?? "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
  if (!limpio) return null
  if (limpio.length < 3 || limpio.length > 20) {
    throw new OperacionError("La cédula debe tener entre 3 y 20 números o letras.")
  }
  return limpio
}

/**
 * El documento como se lee en pantalla. Se guarda en un solo campo: la cedula
 * va sola ("1020304050" -> "CC 1020304050") y otro tipo lleva sus letras
 * adelante, como la tarjeta de identidad de un menor ("TI1029384756" ->
 * "TI 1029384756", asi lo manda la invitacion de la Cena de la Gratitud).
 */
export function documentoLegible(documento: string | null | undefined): string {
  const limpio = String(documento ?? "").trim()
  if (!limpio) return ""
  const [, letras, resto] = limpio.match(/^([A-Za-z]{1,4})(\d.*)$/) ?? []
  return letras ? `${letras.toUpperCase()} ${resto}` : `CC ${limpio}`
}

/** Celular solo con numeros; "+57 300 123 4567" y "3001234567" son el mismo. */
export function normalizarTelefono(valor: unknown): string | null {
  const digitos = String(valor ?? "").replace(/\D/g, "")
  if (!digitos) return null
  const sinPais = digitos.length === 12 && digitos.startsWith("57") ? digitos.slice(2) : digitos
  if (sinPais.length < 7 || sinPais.length > 15) {
    throw new OperacionError("El celular no parece válido: escribe solo los números.")
  }
  return sinPais
}

const CODIGO_BOLETA = /^[0-9a-f]{32}$/i

/**
 * El codigo de la boleta (32 caracteres hexadecimales) en lo que leyo el lector
 * de QR de la puerta. Entiende la direccion que lleva el QR de la boleta
 * (https://talleres.gimnasioemocionalmb.com/entrada/<codigo>), la de la pagina
 * de llegada del ERP (/talleres/llegada/<codigo>), la pagina de la boleta
 * (/boleta/?c=<codigo> o ?boleta=<codigo>) y el codigo solo. Null si no es una
 * entrada.
 */
export function codigoDeBoleta(leido: unknown): string | null {
  if (typeof leido !== "string") return null
  const texto = leido.trim()
  if (CODIGO_BOLETA.test(texto)) return texto.toLowerCase()
  let url: URL
  try {
    url = new URL(texto)
  } catch {
    return null
  }
  const codigo =
    url.pathname.match(/\/(?:entrada|llegada)\/([0-9a-f]{32})\/?$/i)?.[1] ??
    url.searchParams.get("boleta") ??
    url.searchParams.get("c") ??
    ""
  return CODIGO_BOLETA.test(codigo) ? codigo.toLowerCase() : null
}

export function normalizarCorreo(valor: unknown): string | null {
  const correo = String(valor ?? "")
    .trim()
    .toLowerCase()
  if (!correo) return null
  if (correo.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new OperacionError("El correo no parece válido.")
  }
  return correo
}

/** "Encuentro de la Gratitud 2026" -> "encuentro-de-la-gratitud-2026" (la parte final del enlace). */
export function slugDesdeNombre(nombre: string): string {
  return String(nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
}

export function exigirSlug(valor: unknown): string {
  const slug = String(valor ?? "").trim()
  if (!slug || slug.length > 60 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    throw new OperacionError(
      "El enlace solo puede tener letras minúsculas sin tildes, números y guiones (por ejemplo: encuentro-gratitud-2026)."
    )
  }
  return slug
}

/**
 * Fecha y hora del taller. El formulario manda la hora de Colombia sin zona
 * ("2026-11-22T09:00"): se le pone -05:00 para que el servidor (UTC) no la
 * corra 5 horas. Colombia no cambia de horario.
 */
export function normalizarFechaTaller(valor: unknown): string | null {
  const texto = String(valor ?? "").trim()
  if (!texto) return null
  let iso = texto
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) iso = `${texto}T00:00:00-05:00`
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(texto)) iso = `${texto}:00-05:00`
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(texto)) iso = `${texto}-05:00`
  if (Number.isNaN(Date.parse(iso))) throw new OperacionError("La fecha del taller no es válida.")
  return iso
}

/** Las preguntas propias del formulario, limpias. Rechaza lo que el formulario no podria mostrar. */
export function validarPreguntas(valor: unknown): PreguntaTaller[] {
  if (valor === null || valor === undefined || valor === "") return []
  if (!Array.isArray(valor)) throw new OperacionError("Las preguntas del formulario no tienen un formato válido.")
  if (valor.length > MAX_PREGUNTAS) throw new OperacionError(`Máximo ${MAX_PREGUNTAS} preguntas por taller.`)

  const usados = new Set<string>()
  return valor.map((cruda, i) => {
    const p = cruda && typeof cruda === "object" ? (cruda as Record<string, unknown>) : {}
    const numero = i + 1
    const texto = String(p.texto ?? "").trim()
    exigir(texto, `La pregunta ${numero} está vacía.`)
    if (texto.length > 300) throw new OperacionError(`La pregunta ${numero} es muy larga (máximo 300 caracteres).`)

    const tipo = TIPOS_PREGUNTA.find((t) => t === p.tipo)
    exigir(tipo, `La pregunta ${numero} no tiene un tipo de respuesta válido.`)

    let id = String(p.id ?? "").trim()
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) id = `p${numero}`
    while (usados.has(id)) id = `${id}-${numero}`
    usados.add(id)

    const pregunta: PreguntaTaller = { id, texto, tipo, obligatoria: Boolean(p.obligatoria) }
    if (tipo === "opciones") {
      const opciones = [
        ...new Set(
          (Array.isArray(p.opciones) ? p.opciones : [])
            .map((o) => String(o ?? "").trim())
            .filter(Boolean)
        ),
      ]
      if (opciones.length < 2) throw new OperacionError(`La pregunta ${numero} necesita al menos 2 opciones.`)
      if (opciones.length > MAX_OPCIONES) {
        throw new OperacionError(`La pregunta ${numero} tiene demasiadas opciones (máximo ${MAX_OPCIONES}).`)
      }
      if (opciones.some((o) => o.length > 120)) {
        throw new OperacionError(`Una opción de la pregunta ${numero} es muy larga (máximo 120 caracteres).`)
      }
      pregunta.opciones = opciones
    }
    return pregunta
  })
}

/** Las preguntas guardadas en la base; si alguna quedo mal, se ignora en vez de romper la pagina. */
export function preguntasGuardadas(valor: Json | null | undefined): PreguntaTaller[] {
  try {
    return validarPreguntas(valor)
  } catch {
    return []
  }
}

/**
 * Las respuestas de una persona, solo a las preguntas que existen. Desde la
 * invitacion se exigen las obligatorias; el equipo puede inscribir a alguien
 * sin responderlas (por ejemplo, en la puerta).
 */
export function validarRespuestas(
  preguntas: PreguntaTaller[],
  valor: unknown,
  opciones: { exigirObligatorias?: boolean } = {}
): Record<string, string> {
  const entrada = valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {}
  const salida: Record<string, string> = {}
  for (const p of preguntas) {
    const respuesta = String(entrada[p.id] ?? "").trim()
    if (!respuesta) {
      if (p.obligatoria && opciones.exigirObligatorias) throw new OperacionError(`Falta responder: «${p.texto}».`)
      continue
    }
    if (respuesta.length > 2000) throw new OperacionError(`La respuesta a «${p.texto}» es muy larga.`)
    if (p.tipo === "si_no" && respuesta !== "si" && respuesta !== "no") {
      throw new OperacionError(`La respuesta a «${p.texto}» debe ser sí o no.`)
    }
    if (p.tipo === "opciones" && !p.opciones?.includes(respuesta)) {
      throw new OperacionError(`La respuesta a «${p.texto}» no es una de las opciones.`)
    }
    salida[p.id] = respuesta
  }
  return salida
}

export type DatosTaller = {
  nombre: string
  slug?: string | null
  tipo?: string | null
  descripcion?: string | null
  fechaInicio?: string | null
  lugar?: string | null
  precio: number | string
  cupo?: number | string | null
  estado?: string | null
  instruccionesPago?: string | null
  preguntas?: unknown
}

/** Valida un taller y devuelve la fila lista para guardar. No escribe nada. */
export function validarTaller(datos: DatosTaller) {
  const nombre = String(datos.nombre ?? "").trim()
  exigir(nombre, "El nombre del taller es obligatorio.")
  if (nombre.length > 120) throw new OperacionError("El nombre del taller es muy largo (máximo 120 caracteres).")

  const slugEscrito = String(datos.slug ?? "").trim()
  const slug = slugEscrito ? exigirSlug(slugEscrito) : slugDesdeNombre(nombre)
  exigir(slug, "Escribe un nombre con letras o números para armar el enlace.")

  const precio = Number(datos.precio)
  if (!Number.isFinite(precio) || precio < 0) throw new OperacionError("El valor del taller no puede ser negativo.")

  let cupo: number | null = null
  if (datos.cupo !== null && datos.cupo !== undefined && String(datos.cupo).trim() !== "" && Number(datos.cupo) !== 0) {
    cupo = Number(datos.cupo)
    if (!Number.isInteger(cupo) || cupo < 1 || cupo > 10000) {
      throw new OperacionError("El cupo debe ser un número entero mayor a 0 (o déjalo vacío si no hay límite).")
    }
  }

  const estado: EstadoTaller = ESTADOS_TALLER.find((e) => e === datos.estado) ?? "borrador"

  return {
    nombre,
    slug,
    tipo: textoOpcional(datos.tipo, 40, "El tipo") ?? "taller",
    descripcion: textoOpcional(datos.descripcion, 4000, "La descripción"),
    fecha_inicio: normalizarFechaTaller(datos.fechaInicio),
    lugar: textoOpcional(datos.lugar, 200, "El lugar"),
    precio,
    cupo,
    estado,
    instrucciones_pago: textoOpcional(datos.instruccionesPago, 2000, "Cómo pagar"),
    preguntas: validarPreguntas(datos.preguntas) as unknown as Json,
  }
}

// ------------------------------------------------------------- cuentas

export type EstadoPagoTaller = "al_dia" | "abono" | "debe" | "sin_costo"

export const ETIQUETA_ESTADO_PAGO: Record<EstadoPagoTaller, string> = {
  al_dia: "Pagó todo",
  abono: "Abonó",
  debe: "Debe",
  sin_costo: "Sin costo",
}

export function estadoDePago(valorAcordado: number, pagado: number): EstadoPagoTaller {
  if (valorAcordado <= 0) return "sin_costo"
  if (pagado >= valorAcordado) return "al_dia"
  if (pagado > 0) return "abono"
  return "debe"
}

export type PagoLeido = {
  id: string
  taller_inscripcion_id: string | null
  monto: number
  metodo_pago: string
  fecha: string
  estado?: string | null
  notas?: string | null
}

export type GastoLeido = {
  id: string
  concepto: string
  monto: number
  categoria?: string | null
  metodo_pago?: string | null
  fecha: string
  estado?: string | null
  notas?: string | null
}

export type InscripcionParaResumen = Pick<InscripcionTaller, "id" | "valor_acordado" | "estado" | "asistio">

export type FilaCuentaInscripcion<T extends InscripcionParaResumen = InscripcionParaResumen> = T & {
  pagado: number
  pendiente: number
  estadoPago: EstadoPagoTaller
  pagos: PagoLeido[]
}

/**
 * Las cuentas de un taller a partir de sus inscripciones, pagos y gastos. Los
 * pagos y gastos anulados no cuentan. Una inscripcion cancelada no debe nada.
 */
export function resumirTaller<T extends InscripcionParaResumen>(datos: {
  inscripciones: T[]
  pagos: PagoLeido[]
  gastos: GastoLeido[]
}) {
  const pagosValidos = datos.pagos.filter((p) => !esAnuladoCompleto(p))
  const gastosValidos = datos.gastos.filter((g) => !esAnuladoCompleto(g))

  const pagosPorInscripcion = new Map<string, PagoLeido[]>()
  for (const pago of pagosValidos) {
    const clave = pago.taller_inscripcion_id || ""
    pagosPorInscripcion.set(clave, [...(pagosPorInscripcion.get(clave) ?? []), pago])
  }

  const filas: FilaCuentaInscripcion<T>[] = datos.inscripciones.map((inscripcion) => {
    const pagos = pagosPorInscripcion.get(inscripcion.id) ?? []
    const pagado = pagos.reduce((total, p) => total + Number(p.monto || 0), 0)
    const valor = Number(inscripcion.valor_acordado || 0)
    const cancelada = inscripcion.estado === "cancelado"
    return {
      ...inscripcion,
      pagos,
      pagado,
      pendiente: cancelada ? 0 : Math.max(0, valor - pagado),
      estadoPago: estadoDePago(valor, pagado),
    }
  })

  const activas = filas.filter((f) => f.estado !== "cancelado")
  const recaudado = pagosValidos.reduce((total, p) => total + Number(p.monto || 0), 0)
  const gastos = gastosValidos.reduce((total, g) => total + Number(g.monto || 0), 0)

  return {
    filas,
    inscritos: activas.length,
    cancelados: filas.length - activas.length,
    asistieron: activas.filter((f) => f.asistio).length,
    pagaronTodo: activas.filter((f) => f.estadoPago === "al_dia" || f.estadoPago === "sin_costo").length,
    conDeuda: activas.filter((f) => f.pendiente > 0).length,
    esperado: activas.reduce((total, f) => total + Number(f.valor_acordado || 0), 0),
    recaudado,
    porCobrar: activas.reduce((total, f) => total + f.pendiente, 0),
    gastos,
    resultado: recaudado - gastos,
    gastosValidos,
  }
}

export type ResumenTaller = ReturnType<typeof resumirTaller>
