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
