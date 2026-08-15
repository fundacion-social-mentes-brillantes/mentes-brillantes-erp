// Formato de plata mientras se escribe, en colombiano: los miles con punto y
// los centavos con coma. "50000" se ve "50.000".
//
// Existe por un error real (14 de agosto de 2026): el campo de monto era
// <input type="number"> y al bajar la rueda del mouse con el cursor encima,
// 50.000 se volvio 49.999,99 sin que nadie lo tocara. Un campo de texto no
// tiene rueda ni flechas que muevan la cifra, y ademas deja escribir "50.000"
// como lo escribe uno.
//
// Lo que sale de aqui lo entiende `parseMoneyInput` (src/lib/utils/contable),
// que es quien convierte el texto en numero en el servidor.

const MAX_DECIMALES = 2

/**
 * Deja solo lo que puede ser plata y lo agrupa: digitos, una sola coma y como
 * mucho dos decimales. Nunca borra lo que la persona esta escribiendo, solo lo
 * ordena.
 */
export function formatearMontoMientrasEscribe(valor: string): string {
  const crudo = String(valor ?? "")
  // El punto se ignora al escribir: lo pone el formato solo. Asi "50.000" y
  // "50000" terminan igual y nadie pelea con el separador.
  const limpio = crudo.replace(/[^\d,]/g, "")
  if (!limpio) return ""

  const [enteroCrudo, ...resto] = limpio.split(",")
  const hayComa = resto.length > 0
  const decimales = resto.join("").slice(0, MAX_DECIMALES)

  // Sin la parte entera (empezo escribiendo la coma) se asume cero.
  const entero = enteroCrudo.replace(/^0+(?=\d)/, "") || "0"
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".")

  return hayComa ? `${conMiles},${decimales}` : conMiles
}

/** El valor inicial de un campo, ya formateado. */
export function formatearMontoInicial(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return ""
  const numero = typeof valor === "number" ? valor : Number(valor)
  if (!Number.isFinite(numero)) return ""
  const [entero, decimales] = String(Math.abs(numero)).split(".")
  const base = formatearMontoMientrasEscribe(entero)
  return decimales ? `${base},${decimales.slice(0, MAX_DECIMALES)}` : base
}
