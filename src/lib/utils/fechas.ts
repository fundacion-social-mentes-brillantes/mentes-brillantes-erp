// Manejo de fechas en la zona horaria local de la fundacion (Colombia).
//
// El servidor (Vercel) corre en UTC. Usar new Date().toISOString().slice(0,10)
// como "hoy" puede registrar un movimiento creado de noche en Colombia con la
// fecha del dia siguiente (UTC-5). Estos helpers calculan la fecha local real.
//
// Nota: la capa SQL (RPC con CURRENT_DATE y rangos de fn_cerrar_liquidacion)
// sigue usando UTC de forma uniforme; alinear toda la BD a la zona local es un
// cambio mayor diferido. Aqui se corrige la capa de aplicacion (defaults que el
// servidor escribe directamente al crear registros financieros).

export const ZONA_HORARIA = 'America/Bogota'

// Devuelve la fecha local (YYYY-MM-DD) para la zona indicada.
// 'en-CA' formatea de manera estable como YYYY-MM-DD.
export function fechaLocalISO(date: Date = new Date(), timeZone: string = ZONA_HORARIA): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// Fecha de hoy en Colombia (YYYY-MM-DD).
export const fechaHoyBogota = (): string => fechaLocalISO()

/**
 * Fecha y hora de un instante (timestamptz) en hora de Colombia:
 * "7/10/2026, 4:05 p. m.". Sin la zona, la pagina armada en el servidor (UTC)
 * mostraba la hora 5 horas adelantada.
 */
export function formatearFechaHora(instante?: string | Date | null, alterno = ''): string {
  if (!instante) return alterno
  const d = instante instanceof Date ? instante : new Date(instante)
  if (Number.isNaN(d.getTime())) return alterno
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA_HORARIA,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

/** Solo la hora de un instante, en hora de Colombia: "6:05 p. m.". */
export function formatearHora(instante?: string | Date | null, alterno = ''): string {
  if (!instante) return alterno
  const d = instante instanceof Date ? instante : new Date(instante)
  if (Number.isNaN(d.getTime())) return alterno
  return new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, hour: 'numeric', minute: '2-digit' }).format(d)
}

/**
 * Muestra una fecha DATE ('AAAA-MM-DD') tal cual, sin pasarla por new Date().
 *
 * Es importante: new Date('2026-07-30') se interpreta como medianoche UTC, y al
 * formatearla en Bogota (UTC-5) devuelve el 29. Asi es como la misma sesion se
 * veia con una fecha en una pantalla y con la del dia anterior en otra.
 */
export function formatearFechaIso(fecha?: string | null, alterno = '—'): string {
  if (!fecha) return alterno
  const [anio, mes, dia] = String(fecha).slice(0, 10).split('-')
  if (!anio || !mes || !dia) return String(fecha)
  return `${dia}/${mes}/${anio}`
}

/**
 * Fecha y hora de un evento, corta y en hora de Colombia: "sáb 22 nov · 9:00 a. m.".
 * Con `conAnio` agrega el año ("sáb 22 nov 2026 · 9:00 a. m.").
 */
export function formatearFechaEvento(instante?: string | Date | null, alterno = 'Sin fecha', conAnio = false): string {
  if (!instante) return alterno
  const d = instante instanceof Date ? instante : new Date(instante)
  if (Number.isNaN(d.getTime())) return alterno
  const partes = (opciones: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, ...opciones }).format(d).replace(/\./g, '')
  const dia = partes({ weekday: 'short', day: 'numeric', month: 'short', ...(conAnio ? { year: 'numeric' } : {}) })
    .replace(/,/g, '')
    .replace(/ de /g, ' ')
  const hora = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, hour: 'numeric', minute: '2-digit' }).format(d)
  return `${dia} · ${hora}`
}

/** El valor de un <input type="datetime-local"> para un instante, en hora de Colombia. */
export function valorFechaHoraLocal(instante?: string | null): string {
  if (!instante) return ''
  const d = new Date(instante)
  if (Number.isNaN(d.getTime())) return ''
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA_HORARIA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  )
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`
}
