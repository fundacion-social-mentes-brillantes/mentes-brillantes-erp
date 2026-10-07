import { fechaHoyBogota } from '@/lib/utils/fechas'

export type RangoFecha = 'este_mes' | 'mes_pasado' | 'todos' | 'custom'

/**
 * Fechas (AAAA-MM-DD, hora de Colombia) de un rango predefinido; null en
 * 'custom', donde las escribe la persona. 'todos' va sin fechas.
 */
export function fechasDeRango(rango: RangoFecha, hoy: string = fechaHoyBogota()): { inicio: string; fin: string } | null {
  const [anio, mes] = hoy.split('-').map(Number)
  const mesIso = (a: number, m: number) => `${a}-${String(m).padStart(2, '0')}`
  const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate()
  if (rango === 'este_mes') {
    return { inicio: `${mesIso(anio, mes)}-01`, fin: `${mesIso(anio, mes)}-${ultimoDia(anio, mes)}` }
  }
  if (rango === 'mes_pasado') {
    const a = mes === 1 ? anio - 1 : anio
    const m = mes === 1 ? 12 : mes - 1
    return { inicio: `${mesIso(a, m)}-01`, fin: `${mesIso(a, m)}-${ultimoDia(a, m)}` }
  }
  if (rango === 'todos') return { inicio: '', fin: '' }
  return null
}
