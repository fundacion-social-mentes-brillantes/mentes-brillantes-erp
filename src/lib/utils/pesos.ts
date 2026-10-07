// Una sola forma de mostrar plata en todo el ERP: "$ 100.000".
//
// Antes cada pantalla usaba toLocaleString() sin decir el pais: en el servidor
// (Vercel, en ingles) salia "$100,000" y en el navegador "$100.000", a veces en
// la misma pagina. Aqui siempre es pesos colombianos, sin decimales, con punto
// de miles y el signo antes del "$" ("-$ 5.000"). Un cero nunca lleva signo.

const MILES = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 })

/** Espacio que no se parte: "$" y la cifra nunca quedan en renglones distintos. */
const ESPACIO = " "

export function pesos(valor: number | string | null | undefined): string {
  const numero = Math.round(Number(valor))
  if (!Number.isFinite(numero) || numero === 0) return `$${ESPACIO}0`
  const signo = numero < 0 ? "-" : ""
  return `${signo}$${ESPACIO}${MILES.format(Math.abs(numero))}`
}

/** Solo la cifra con punto de miles ("100.000"), para contadores y graficas. */
export function miles(valor: number | string | null | undefined): string {
  const numero = Math.round(Number(valor))
  return Number.isFinite(numero) ? MILES.format(numero) : "0"
}
