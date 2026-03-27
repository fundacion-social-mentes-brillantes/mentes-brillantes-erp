type FechaNullable = string | null | undefined

const toDate = (value: FechaNullable): Date | null => {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

type Pago = { fecha_pago?: FechaNullable }
type Cuenta = { fecha_emision?: FechaNullable; pagos_abonos?: Pago[] | null }
type MovimientoSaldo = { fecha?: FechaNullable }
type Donacion = { fecha?: FechaNullable }
type SesionCoach = { fecha?: FechaNullable }

export type AsistenteActividad = {
  cuentas_por_cobrar?: Cuenta[] | null
  movimientos_saldo_favor?: MovimientoSaldo[] | null
  donaciones_asistentes?: Donacion[] | null
  coach_sesiones?: SesionCoach[] | null
}

export function obtenerUltimaActividad(data: AsistenteActividad): Date | null {
  const fechas: Date[] = []

  data.cuentas_por_cobrar?.forEach((c) => {
    const fe = toDate(c.fecha_emision)
    if (fe) fechas.push(fe)
    c.pagos_abonos?.forEach((p) => {
      const fp = toDate(p.fecha_pago)
      if (fp) fechas.push(fp)
    })
  })

  data.movimientos_saldo_favor?.forEach((m) => {
    const f = toDate(m.fecha)
    if (f) fechas.push(f)
  })

  data.donaciones_asistentes?.forEach((d) => {
    const f = toDate(d.fecha)
    if (f) fechas.push(f)
  })

  data.coach_sesiones?.forEach((s) => {
    const f = toDate(s.fecha)
    if (f) fechas.push(f)
  })

  if (!fechas.length) return null
  return fechas.reduce((max, curr) => (curr > max ? curr : max), fechas[0])
}

export function estadoPorActividad(data: AsistenteActividad, referencia: Date = new Date()) {
  const ultima = obtenerUltimaActividad(data)
  const limite = new Date(referencia)
  limite.setMonth(limite.getMonth() - 6)
  const activo = ultima ? ultima >= limite : false
  return { ultima_actividad: ultima, activo }
}
