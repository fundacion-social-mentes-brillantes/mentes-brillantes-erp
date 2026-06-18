import { toSafeNumber } from './contable'

export type PuntoBalanceDiario = {
  date: string
  ingresos: number
  egresos: number
  balance: number
}

type MovimientoDiario = { fecha?: string | null; monto?: number | string | null }

// Construye la serie diaria de ingresos/egresos y el balance acumulado para el
// grafico del dashboard. Los ingresos deben venir ya unificados (abonos,
// ingresos reales de saldo a favor, ventas externas y donaciones) para que el
// grafico cuadre con el KPI de ingresos totales.
export function construirSerieDiaria(
  dias: string[],
  ingresos: MovimientoDiario[] = [],
  egresos: MovimientoDiario[] = []
): PuntoBalanceDiario[] {
  const mapa: Record<string, { ingresos: number; egresos: number }> = {}
  for (const dia of dias) mapa[dia] = { ingresos: 0, egresos: 0 }

  for (const item of ingresos) {
    const fecha = item.fecha || ''
    if (mapa[fecha]) mapa[fecha].ingresos += toSafeNumber(item.monto)
  }
  for (const item of egresos) {
    const fecha = item.fecha || ''
    if (mapa[fecha]) mapa[fecha].egresos += toSafeNumber(item.monto)
  }

  let acumulado = 0
  return Object.keys(mapa)
    .sort()
    .map((date) => {
      const dia = mapa[date]
      acumulado += dia.ingresos - dia.egresos
      return {
        date: date.split('-')[2], // solo el dia
        ingresos: dia.ingresos,
        egresos: dia.egresos,
        balance: acumulado,
      }
    })
}
