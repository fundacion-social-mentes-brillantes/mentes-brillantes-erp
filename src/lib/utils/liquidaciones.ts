import {
  filtrarIngresosOperativos,
  filtrarIngresosRealesSaldoAFavor,
  esAnuladoCompleto,
  toSafeNumber,
} from "./contable"

export type MetodoPago = "efectivo" | "nequi" | "daviplata" | "otro"
export type CategoriaResumenDetalle = "ingreso" | "egreso" | "adelanto"
export type TipoResumenDetalle = "abono" | "saldo_favor" | "donacion" | "venta_externa" | "egreso" | "adelanto"

type Movimiento = {
  id?: string
  monto?: number | string
  metodo_pago?: string | null
  estado?: string | null
  notas?: string | null
  origen_fondos?: string | null
  tipo?: string | null
  /** Solo en devoluciones de adelanto: el adelanto del que salen. */
  adelanto_id?: string | null
  socio_id?: string | null
  fecha?: string | null
  fecha_pago?: string | null
  concepto?: string | null
  comprador_nombre?: string | null
  categoria?: string | null
  cuentas_por_cobrar?: any
  asistentes?: any
  socios?: any
}

export type MovimientoResumenDetalle = {
  id: string
  fecha: string
  metodo_pago: MetodoPago
  categoria: CategoriaResumenDetalle
  tipo: TipoResumenDetalle
  persona: string
  concepto: string
  monto: number
}

export type ResumenMetodo = {
  metodo_pago: MetodoPago
  total_ingresos: number
  total_salidas: number
  saldo_neto_periodo: number
  ingresos_abonos?: number
  ingresos_donaciones?: number
  ingresos_ventas_externas?: number
  salidas_egresos?: number
  salidas_adelantos?: number
}

export const METODOS_PAGO_RESUMEN: MetodoPago[] = ["efectivo", "nequi", "daviplata", "otro"]

export const normalizarMetodo = (m?: string | null): MetodoPago => {
  const v = (m || "").toLowerCase().trim() as MetodoPago
  return METODOS_PAGO_RESUMEN.includes(v) ? v : "otro"
}

const firstRecord = (value: any) => (Array.isArray(value) ? value[0] : value)

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "")

const fallbackText = (...values: unknown[]) => values.map(cleanText).find(Boolean) || ""

const personaAsistente = (mov: Movimiento) => {
  const asistenteDirecto = firstRecord(mov.asistentes)
  const cuenta = firstRecord(mov.cuentas_por_cobrar)
  const asistenteCuenta = firstRecord(cuenta?.asistentes)
  return fallbackText(asistenteDirecto?.nombre, asistenteCuenta?.nombre, "Sin persona asociada")
}

const personaSocio = (mov: Movimiento) => {
  const socio = firstRecord(mov.socios)
  return fallbackText(socio?.nombre, "Sin persona asociada")
}

const detalleId = (prefix: TipoResumenDetalle, index: number, id?: string) => `${prefix}-${id || index}`

/**
 * Un adelanto devuelto por el socio se guarda en la misma tabla, con
 * `tipo='devolucion'` y monto negativo, para que TODA suma de adelantos lo
 * descuente sola. Aqui solo se usa para nombrarlo distinto.
 */
export const esDevolucionAdelanto = (m: { tipo?: string | null }) => (m?.tipo || "") === "devolucion"

export type AdelantoConDevoluciones<T extends Movimiento = Movimiento> = {
  adelanto: T
  devoluciones: T[]
  entregado: number
  devuelto: number
  pendiente: number
}

/**
 * Cuelga cada devolucion del adelanto que devuelve y dice cuanto queda por
 * devolver. Es solo para mostrar: las cuentas siguen saliendo de sumar el
 * `monto` de todos los movimientos, con su signo.
 *
 * Una devolucion huerfana (su adelanto no viene en la lista, p. ej. porque el
 * adelanto quedo en otro periodo) no se pierde: se devuelve aparte para poder
 * mostrarla en vez de tragarsela.
 */
export function agruparAdelantosConDevoluciones<T extends Movimiento>(
  movimientos: T[] = []
): { adelantos: AdelantoConDevoluciones<T>[]; devolucionesHuerfanas: T[] } {
  const adelantos = movimientos.filter((m) => !esDevolucionAdelanto(m))
  const devoluciones = movimientos.filter((m) => esDevolucionAdelanto(m))

  const grupos = new Map<string, AdelantoConDevoluciones<T>>()
  for (const adelanto of adelantos) {
    const clave = String((adelanto as any).id || "")
    grupos.set(clave, {
      adelanto,
      devoluciones: [],
      entregado: toSafeNumber(adelanto.monto),
      devuelto: 0,
      pendiente: toSafeNumber(adelanto.monto),
    })
  }

  const huerfanas: T[] = []
  for (const devolucion of devoluciones) {
    const clave = String((devolucion as any).adelanto_id || "")
    const grupo = grupos.get(clave)
    if (!grupo) {
      huerfanas.push(devolucion)
      continue
    }
    grupo.devoluciones.push(devolucion)
    grupo.devuelto += Math.abs(toSafeNumber(devolucion.monto))
    grupo.pendiente = Math.round((grupo.entregado - grupo.devuelto) * 100) / 100
  }

  return { adelantos: Array.from(grupos.values()), devolucionesHuerfanas: huerfanas }
}

export function construirDetallesResumenPorCuenta({
  abonos = [],
  donaciones = [],
  ventasExternas = [],
  egresos = [],
  adelantos = [],
  ingresosSaldoFavor = [],
}: {
  abonos?: Movimiento[]
  donaciones?: Movimiento[]
  ventasExternas?: Movimiento[]
  egresos?: Movimiento[]
  adelantos?: Movimiento[]
  ingresosSaldoFavor?: Movimiento[]
}): MovimientoResumenDetalle[] {
  const detalles: MovimientoResumenDetalle[] = []

  filtrarIngresosOperativos(abonos).forEach((p, index) => {
    const cuenta = firstRecord(p.cuentas_por_cobrar)
    detalles.push({
      id: detalleId("abono", index, p.id),
      fecha: p.fecha_pago || p.fecha || "",
      metodo_pago: normalizarMetodo(p.metodo_pago),
      categoria: "ingreso",
      tipo: "abono",
      persona: personaAsistente(p),
      concepto: fallbackText(cuenta?.concepto, p.notas, "Abono"),
      monto: toSafeNumber(p.monto),
    })
  })

  filtrarIngresosRealesSaldoAFavor(ingresosSaldoFavor).forEach((p, index) => {
    const cuenta = firstRecord(p.cuentas_por_cobrar)
    detalles.push({
      id: detalleId("saldo_favor", index, p.id),
      fecha: p.fecha || p.fecha_pago || "",
      metodo_pago: normalizarMetodo(p.metodo_pago),
      categoria: "ingreso",
      tipo: "saldo_favor",
      persona: personaAsistente(p),
      concepto: fallbackText(p.notas, cuenta?.concepto, "Ingreso real de saldo a favor"),
      monto: toSafeNumber(p.monto),
    })
  })

  donaciones
    .filter((d) => !esAnuladoCompleto(d))
    .forEach((d, index) => {
      detalles.push({
        id: detalleId("donacion", index, d.id),
        fecha: d.fecha || "",
        metodo_pago: normalizarMetodo(d.metodo_pago),
        categoria: "ingreso",
        tipo: "donacion",
        persona: personaAsistente(d),
        concepto: fallbackText(d.notas, "Donacion"),
        monto: toSafeNumber(d.monto),
      })
    })

  ventasExternas
    .filter((v) => !esAnuladoCompleto(v))
    .forEach((v, index) => {
      detalles.push({
        id: detalleId("venta_externa", index, v.id),
        fecha: v.fecha || "",
        metodo_pago: normalizarMetodo(v.metodo_pago),
        categoria: "ingreso",
        tipo: "venta_externa",
        persona: fallbackText(v.comprador_nombre, "Sin persona asociada"),
        concepto: fallbackText(v.concepto, v.notas, "Venta externa"),
        monto: toSafeNumber(v.monto),
      })
    })

  egresos
    .filter((e) => !esAnuladoCompleto(e))
    .forEach((e, index) => {
      detalles.push({
        id: detalleId("egreso", index, e.id),
        fecha: e.fecha || "",
        metodo_pago: normalizarMetodo(e.metodo_pago),
        categoria: "egreso",
        tipo: "egreso",
        persona: "Sin persona asociada",
        concepto: fallbackText(e.concepto, e.notas, e.categoria, "Egreso"),
        monto: toSafeNumber(e.monto),
      })
    })

  adelantos.forEach((a, index) => {
    detalles.push({
      id: detalleId("adelanto", index, a.id),
      fecha: a.fecha || "",
      metodo_pago: normalizarMetodo(a.metodo_pago),
      categoria: "adelanto",
      tipo: "adelanto",
      persona: personaSocio(a),
      // La devolucion viaja en la misma lista, con monto negativo. Se distingue
      // solo en el texto: la categoria sigue siendo adelanto porque es la misma
      // plata, de vuelta.
      concepto: fallbackText(a.notas, esDevolucionAdelanto(a) ? "Devolución de adelanto" : "Adelanto a socio"),
      monto: toSafeNumber(a.monto),
    })
  })

  return detalles.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export type AdelantosDeSocio<T extends Movimiento = Movimiento> = {
  socioId: string
  nombre: string
  entregado: number
  devuelto: number
  pendiente: number
  adelantos: AdelantoConDevoluciones<T>[]
}

/**
 * Junta por persona los adelantos con sus devoluciones. Es lo que hace falta
 * para responder "¿cuánto le debe Valeria?" sin sumar a mano, y para contarle
 * a ella misma la historia completa: cuánto se le adelantó, cuánto ha
 * devuelto y qué queda.
 */
export function agruparAdelantosPorSocio<T extends Movimiento>(
  adelantos: AdelantoConDevoluciones<T>[] = []
): AdelantosDeSocio<T>[] {
  const porSocio = new Map<string, AdelantosDeSocio<T>>()

  for (const grupo of adelantos) {
    const fila = grupo.adelanto as any
    const socioId = String(fila?.socio_id || "")
    const socio = Array.isArray(fila?.socios) ? fila.socios[0] : fila?.socios
    const actual =
      porSocio.get(socioId) ||
      ({
        socioId,
        nombre: socio?.nombre || "Sin nombre",
        entregado: 0,
        devuelto: 0,
        pendiente: 0,
        adelantos: [],
      } as AdelantosDeSocio<T>)

    actual.entregado = Math.round((actual.entregado + grupo.entregado) * 100) / 100
    actual.devuelto = Math.round((actual.devuelto + grupo.devuelto) * 100) / 100
    actual.pendiente = Math.round((actual.pendiente + grupo.pendiente) * 100) / 100
    actual.adelantos.push(grupo)
    porSocio.set(socioId, actual)
  }

  // Del más viejo al más nuevo: es el orden en que se cuenta la historia y el
  // orden en que se van pagando.
  for (const socio of Array.from(porSocio.values())) {
    socio.adelantos.sort((a, b) =>
      String((a.adelanto as any).fecha || "").localeCompare(String((b.adelanto as any).fecha || ""))
    )
  }

  return Array.from(porSocio.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export function agruparPorMetodo({
  abonos = [],
  donaciones = [],
  ventasExternas = [],
  egresos = [],
  adelantos = [],
  ingresosSaldoFavor = [],
}: {
  abonos?: Movimiento[]
  donaciones?: Movimiento[]
  ventasExternas?: Movimiento[]
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
        ingresos_ventas_externas: 0,
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

  ventasExternas
    .filter((v) => !esAnuladoCompleto(v))
    .forEach((v) => {
      const key = normalizarMetodo(v.metodo_pago)
      base[key].ingresos_ventas_externas = (base[key].ingresos_ventas_externas || 0) + Number(v.monto || 0)
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
    item.total_ingresos =
      (item.ingresos_abonos || 0) + (item.ingresos_donaciones || 0) + (item.ingresos_ventas_externas || 0)
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
      ingresos_ventas_externas:
        (acc.ingresos_ventas_externas || 0) + (r.ingresos_ventas_externas || 0),
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
      ingresos_ventas_externas: 0,
      salidas_egresos: 0,
      salidas_adelantos: 0,
    }
  )

  return { resumen, totales }
}
