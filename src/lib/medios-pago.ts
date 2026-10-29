import type { DbClient } from "@/lib/supabase/types"

// Las cuentas de dinero de la fundacion: efectivo, Nequi, Daviplata, Banco Caja
// Social... (tabla medios_pago, desde 2026-10-29).
//
// Cada pago guarda la CLAVE de su cuenta (efectivo, nequi, banco_caja_social).
// Lo que ve la gente es el NOMBRE, que el admin puede cambiar en Configuracion
// sin tocar ningun registro: por eso las pantallas nunca deben escribir los
// nombres a mano, sino pedirlos aqui (nombreMedio) o usar <OpcionesMedioPago />.
//
// saldo_a_favor tambien es un valor del metodo de pago, pero no es una cuenta:
// lo pone el sistema al aplicar saldo y no aparece en la lista.

export type MedioPago = {
  clave: string
  nombre: string
  activo: boolean
  orden: number
}

/** Las cuentas que habia al crear la tabla: sirven si la base no responde. */
export const MEDIOS_POR_DEFECTO: MedioPago[] = [
  { clave: "efectivo", nombre: "Efectivo", activo: true, orden: 10 },
  { clave: "nequi", nombre: "Nequi", activo: true, orden: 20 },
  { clave: "daviplata", nombre: "Daviplata", activo: true, orden: 30 },
  { clave: "banco_caja_social", nombre: "Banco Caja Social", activo: true, orden: 40 },
  { clave: "otro", nombre: "Otro", activo: true, orden: 90 },
]

const NOMBRES_DEL_SISTEMA: Record<string, string> = {
  saldo_a_favor: "Saldo a favor",
  transferencia: "Transferencia",
}

// Lo ultimo que se leyo de la base. Vive en memoria del servidor (y del
// navegador, que lo recibe del layout): basta para nombrar y validar.
let conocidos: MedioPago[] = MEDIOS_POR_DEFECTO
let leidoEn = 0
const VIGENCIA_MS = 60_000

export function recordarMedios(lista: MedioPago[]) {
  if (Array.isArray(lista) && lista.length > 0) {
    conocidos = [...lista].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"))
  }
}

/** Todas las cuentas conocidas, en su orden (incluye las ocultas). */
export function mediosConocidos(): MedioPago[] {
  return conocidos
}

/** Las cuentas que se ofrecen al registrar algo nuevo. */
export function mediosActivos(): MedioPago[] {
  return conocidos.filter((m) => m.activo)
}

function capitalizar(texto: string) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto
}

/** El nombre que ve la gente para una clave ("banco_caja_social" -> "Banco Caja Social"). */
export function nombreMedio(clave: string | null | undefined, alterno = "—"): string {
  if (!clave) return alterno
  const limpia = String(clave).trim().toLowerCase()
  const medio = conocidos.find((m) => m.clave === limpia)
  if (medio) return medio.nombre
  return NOMBRES_DEL_SISTEMA[limpia] ?? capitalizar(limpia.replace(/_/g, " "))
}

/** ¿Es la clave de una cuenta conocida? (saldo_a_favor no lo es.) */
export function esClaveDeMedio(clave: unknown, opciones: { soloActivas?: boolean } = {}): clave is string {
  if (typeof clave !== "string") return false
  const lista = opciones.soloActivas ? mediosActivos() : conocidos
  return lista.some((m) => m.clave === clave)
}

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()
}

const comoClave = (texto: string) => sinTildes(texto).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")

/**
 * La clave de una cuenta a partir de lo que escribio alguien: la clave misma
 * ("banco_caja_social"), el nombre ("Banco Caja Social", "banco caja social") o
 * el nombre sin tildes. Si no corresponde a ninguna cuenta, null.
 */
export function resolverClaveMedio(texto: unknown): string | null {
  if (typeof texto !== "string" || !texto.trim()) return null
  const limpio = texto.trim()
  const exacta = conocidos.find((m) => m.clave === limpio)
  if (exacta) return exacta.clave
  const buscado = sinTildes(limpio)
  const porNombre = conocidos.find((m) => sinTildes(m.nombre) === buscado)
  if (porNombre) return porNombre.clave
  const clave = comoClave(limpio)
  return conocidos.find((m) => m.clave === clave || comoClave(m.nombre) === clave)?.clave ?? null
}

/**
 * Lee las cuentas de la base (con una vigencia corta, para no consultarla en
 * cada pago) y las deja recordadas para nombrar y validar. Si la base falla,
 * se queda con lo ultimo que sabia.
 */
export async function cargarMediosPago(supabase: DbClient | null | undefined, opciones: { forzar?: boolean } = {}) {
  if (!supabase) return conocidos
  if (!opciones.forzar && Date.now() - leidoEn < VIGENCIA_MS) return conocidos
  try {
    const { data, error } = await supabase
      .from("medios_pago")
      .select("clave, nombre, activo, orden")
      .order("orden", { ascending: true })
    const filas = Array.isArray(data)
      ? (data as Partial<MedioPago>[]).filter((m): m is MedioPago => typeof m?.clave === "string" && typeof m?.nombre === "string")
      : []
    if (!error && filas.length > 0) {
      recordarMedios(filas.map((m) => ({ ...m, activo: m.activo !== false, orden: Number(m.orden) || 0 })))
      leidoEn = Date.now()
    }
  } catch {
    // Sin respuesta de la base: basta con lo ultimo que se sabia para nombrar y validar.
  }
  return conocidos
}

/** Para las pruebas: vuelve a la lista inicial. */
export function olvidarMedios() {
  conocidos = MEDIOS_POR_DEFECTO
  leidoEn = 0
}
