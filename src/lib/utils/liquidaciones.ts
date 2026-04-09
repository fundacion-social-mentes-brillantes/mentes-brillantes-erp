import { filtrarIngresosOperativos, filtrarIngresosRealesSaldoAFavor, esAnuladoCompleto } from "./contable"

export type MetodoPago = "efectivo" | "nequi" | "daviplata" | "otro"

type Movimiento = {
  monto?: number | string
  metodo_pago?: string | null
  estado?: string | null
  notas?: string | null
  origen_fondos?: string | null
  tipo?: string | null
}

type ResumenMetodo = {
  metodo_pago: MetodoPago
  total_ingresos: number
  total_salidas: number
  saldo_neto_periodo: number
  ingresos_abonos?: number
  ingresos_donaciones?: number
  salidas_egresos?: number
  salidas_adelantos?: number
}

export const METODOS_PAGO_RESUMEN: MetodoPago[] = ["efectivo", "nequi", "daviplata", "otro"]

const normalizarMetodo = (m?: string | null): MetodoPago => {
  const v = (m || "").toLowerCase().trim() as MetodoPago
  return METODOS_PAGO_RESUMEN.includes(v) ? v : "otro"
}

export function agruparPorMetodo({
  abonos = [],
  donaciones = [],
  egresos = [],
  adelantos = [],
  ingresosSaldoFavor = [],
}: {
  abonos?: Movimiento[]
  donaciones?: Movimiento[]
  egresos?: Movimiento[]
  adelantos?: Movimiento[]
  ingresosSaldoFavor?: Movimiento[]
}): { resumen: ResumenMetodo[]; totales: ResumenMetodo } {
  const base = METODOS_PAGO_RESUMEN.reduce<Record<MetodoPago, ResumenMetodo>>(
    (acc, m) => ({
      ...acc,
      [m]: {
        metodo_pago: m,
        total_ingresos: 0,
        total_salidas: 0,
        saldo_neto_periodo: 0,
        ingresos_abonos: 0,
        ingresos_donaciones: 0,
        salidas_egresos: 0,
        salidas_adelantos: 0,
      },
    }),
    {} as Record<MetodoPago, ResumenMetodo>
  )

  filtrarIngresosOperativos(abonos).forEach((p) => {
    const key = normalizarMetodo(p.metodo_pago)
    base[key].ingresos_abonos = (base[key].ingresos_abonos || 0) + Number(p.monto || 0)
  })

  filtrarIngresosRealesSaldoAFavor(ingresosSaldoFavor).forEach((p) => {
    const key = normalizarMetodo(p.metodo_pago)
    base[key].ingresos_abonos = (base[key].ingresos_abonos || 0) + Number(p.monto || 0)
  })

  donaciones
    .filter((d) => !esAnuladoCompleto(d))
    .forEach((d) => {
      const key = normalizarMetodo(d.metodo_pago)
      base[key].ingresos_donaciones = (base[key].ingresos_donaciones || 0) + Number(d.monto || 0)
    })

  egresos
    .filter((e) => !esAnuladoCompleto(e))
    .forEach((e) => {
      const key = normalizarMetodo(e.metodo_pago)
      base[key].salidas_egresos = (base[key].salidas_egresos || 0) + Number(e.monto || 0)
    })

  adelantos.forEach((a) => {
    const key = normalizarMetodo(a.metodo_pago)
    base[key].salidas_adelantos = (base[key].salidas_adelantos || 0) + Number(a.monto || 0)
  })

  const resumen = METODOS_PAGO_RESUMEN.map((m) => {
    const item = base[m]
    item.total_ingresos = (item.ingresos_abonos || 0) + (item.ingresos_donaciones || 0)
    item.total_salidas = item.salidas_egresos || 0
    item.saldo_neto_periodo = item.total_ingresos - item.total_salidas
    return item
  })

  const totales = resumen.reduce<ResumenMetodo>(
    (acc, r) => ({
      metodo_pago: "otro",
      total_ingresos: acc.total_ingresos + r.total_ingresos,
      total_salidas: acc.total_salidas + r.total_salidas,
      saldo_neto_periodo: acc.saldo_neto_periodo + r.saldo_neto_periodo,
      ingresos_abonos: (acc.ingresos_abonos || 0) + (r.ingresos_abonos || 0),
      ingresos_donaciones: (acc.ingresos_donaciones || 0) + (r.ingresos_donaciones || 0),
      salidas_egresos: (acc.salidas_egresos || 0) + (r.salidas_egresos || 0),
      salidas_adelantos: (acc.salidas_adelantos || 0) + (r.salidas_adelantos || 0),
    }),
    {
      metodo_pago: "otro",
      total_ingresos: 0,
      total_salidas: 0,
      saldo_neto_periodo: 0,
      ingresos_abonos: 0,
      ingresos_donaciones: 0,
      salidas_egresos: 0,
      salidas_adelantos: 0,
    }
  )

  return { resumen, totales }
}
