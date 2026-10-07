// Textos tal como los debe leer una persona.
//
// En la base viven valores tecnicos ("saldo_a_favor", "activo") y las notas que
// escribe el sistema llevan marcas internas como "[ABONO:53881626-...]" para que
// el ERP sepa que movimiento genero cual. Esas marcas se siguen guardando (las
// usan las reglas contables); aqui solo se quitan de lo que se muestra.

const METODOS: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  otro: "Otro",
  saldo_a_favor: "Saldo a favor",
  transferencia: "Transferencia",
}

export function metodoPagoLegible(metodo: string | null | undefined, alterno = "—"): string {
  if (!metodo) return alterno
  const clave = String(metodo).trim().toLowerCase()
  return METODOS[clave] ?? capitalizar(clave.replace(/_/g, " "))
}

export function estadoLegible(estado: string | null | undefined, alterno = "—"): string {
  if (!estado) return alterno
  return capitalizar(String(estado).trim().replace(/_/g, " ").toLowerCase())
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const MARCA_INTERNA = new RegExp(`\\[[A-Z_]+:${UUID}\\]\\s*`, "gi")
const A_LA_CUENTA = new RegExp(`\\s+a la cuenta ${UUID}`, "gi")
const UUID_SUELTO = new RegExp(`\\b${UUID}\\b`, "gi")

// Palabras que el sistema escribio sin tilde en notas automaticas viejas.
const TILDES: Array<[RegExp, string]> = [
  [/\bAplicacion\b/g, "Aplicación"],
  [/\baplicacion\b/g, "aplicación"],
  [/\banulacion\b/g, "anulación"],
  [/\bAnulacion\b/g, "Anulación"],
  [/\bcreacion\b/g, "creación"],
  [/\bdevolucion\b/g, "devolución"],
]

/** Nota sin marcas tecnicas ni ids. Vacia si no queda nada que leer. */
export function notaLegible(nota: string | null | undefined): string {
  if (!nota) return ""
  let texto = String(nota).replace(MARCA_INTERNA, "").replace(A_LA_CUENTA, "").replace(UUID_SUELTO, "")
  for (const [patron, reemplazo] of TILDES) texto = texto.replace(patron, reemplazo)
  return texto.replace(/\s{2,}/g, " ").trim()
}

function capitalizar(texto: string) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto
}
