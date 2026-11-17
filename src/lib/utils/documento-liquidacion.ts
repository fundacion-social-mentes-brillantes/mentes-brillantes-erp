// Textos y cuentas del reporte de liquidacion que se descarga en PDF e imagen.
// Van aparte del dibujo para poder probarlos: las fechas se arman sin pasar por
// new Date() ('AAAA-MM-DD' en UTC se corre un dia en Colombia).

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function partes(iso: string): { anio: number; mes: number; dia: number } | null {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number)
  if (!a || !m || !d || m < 1 || m > 12) return null
  return { anio: a, mes: m, dia: d }
}

/** '2026-10-03' → '3 de octubre de 2026' (o sin el año). */
export function fechaEnPalabras(iso: string, conAnio = true): string {
  const p = partes(iso)
  if (!p) return String(iso || '')
  return `${p.dia} de ${MESES[p.mes - 1]}${conAnio ? ` de ${p.anio}` : ''}`
}

/** '2026-10-07' → '7 oct'. */
export function fechaCorta(iso: string): string {
  const p = partes(iso)
  return p ? `${p.dia} ${MESES_CORTOS[p.mes - 1]}` : String(iso || '')
}

/**
 * El periodo en tres renglones que se leen como una sola frase:
 * «Del 3 de octubre / al 17 de noviembre / de 2026». Si cruza de año, cada
 * fecha lleva el suyo y no hay tercer renglón.
 */
export function rangoDelPeriodo(inicio: string, fin: string): { desde: string; hasta: string; anio: string | null; frase: string } {
  const a = partes(inicio)
  const b = partes(fin)
  if (!a || !b) {
    const frase = `Del ${inicio} al ${fin}`
    return { desde: `Del ${inicio}`, hasta: `al ${fin}`, anio: null, frase }
  }
  if (a.anio !== b.anio) {
    const desde = `Del ${fechaEnPalabras(inicio)}`
    const hasta = `al ${fechaEnPalabras(fin)}`
    return { desde, hasta, anio: null, frase: `${desde} ${hasta}` }
  }
  const desde = a.mes === b.mes ? `Del ${a.dia}` : `Del ${fechaEnPalabras(inicio, false)}`
  const hasta = `al ${fechaEnPalabras(fin, false)}`
  const anio = `de ${b.anio}`
  return { desde, hasta, anio, frase: `${desde} ${hasta} ${anio}` }
}

/** Cuantos dias cubre el periodo, contando el primero y el ultimo. */
export function diasDelPeriodo(inicio: string, fin: string): number | null {
  const a = partes(inicio)
  const b = partes(fin)
  if (!a || !b) return null
  const dias = Math.round((Date.UTC(b.anio, b.mes - 1, b.dia) - Date.UTC(a.anio, a.mes - 1, a.dia)) / 86_400_000) + 1
  return dias > 0 ? dias : null
}

/**
 * La nota de un adelanto, corta para que quepa en la columna del socio: sin lo
 * que va entre parentesis al final y cortada en una palabra entera.
 */
export function notaCorta(nota: string | null | undefined, maximo = 64): string | null {
  let texto = String(nota || '').replace(/\s+/g, ' ').trim()
  texto = texto.replace(/\s*\([^()]*\)\s*\.?$/, '').trim()
  texto = texto.replace(/\.$/, '')
  if (!texto) return null
  if (texto.length <= maximo) return texto
  let corte = texto.slice(0, maximo + 1).replace(/\s+\S*$/, '') || texto.slice(0, maximo)
  // Que no termine colgando en «por su…» o «de la…»: esas palabras sueltas se quitan.
  const palabras = corte.split(' ')
  while (palabras.length > 1 && CONECTORES.has(palabras[palabras.length - 1].toLowerCase())) palabras.pop()
  corte = palabras.join(' ')
  return `${corte.replace(/[\s,;:.]+$/, '')}…`
}

const CONECTORES = new Set([
  'a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'lo', 'los', 'para', 'por', 'que', 'se', 'su', 'sus', 'un', 'una', 'y', 'e', 'o',
])

/** '901002849-2' → '901.002.849-2'. Si no tiene esa forma, lo deja como venga. */
export function nitLegible(nit: string): string {
  const limpio = String(nit || '').trim()
  const m = limpio.match(/^(\d{6,12})-?(\d)$/)
  if (!m) return limpio
  return `${m[1].replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${m[2]}`
}

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e'])

/** 'Valeria lopez' → 'Valeria Lopez'. No inventa tildes: solo pone la mayuscula que falta. */
export function nombrePropio(nombre: string): string {
  return String(nombre || '')
    .trim()
    .split(/\s+/)
    .map((palabra, i) =>
      i > 0 && MINUSCULAS.has(palabra.toLowerCase())
        ? palabra.toLowerCase()
        : palabra.charAt(0).toLocaleUpperCase('es-CO') + palabra.slice(1)
    )
    .join(' ')
}

/**
 * Las columnas de los socios pueden tener el ancho de su porcentaje (y quedar
 * justo debajo de su pedazo de la barra) solo si ninguna queda muy angosta.
 */
export function columnasProporcionales(porcentajes: number[]): boolean {
  if (porcentajes.length < 2 || porcentajes.length > 4) return false
  const total = porcentajes.reduce((a, b) => a + b, 0)
  if (Math.abs(total - 100) > 0.5) return false
  return porcentajes.every((p) => p >= 20)
}

/** Que parte de lo que entro se fue en gastos y que parte quedo, en porcentajes enteros que suman 100. */
export function partesDelPeriodo(ingresos: number, egresos: number): { gastos: number; queda: number } {
  if (!(ingresos > 0)) return { gastos: egresos > 0 ? 100 : 0, queda: 0 }
  const gastos = Math.min(100, Math.max(0, Math.round((egresos / ingresos) * 100)))
  return { gastos, queda: 100 - gastos }
}
