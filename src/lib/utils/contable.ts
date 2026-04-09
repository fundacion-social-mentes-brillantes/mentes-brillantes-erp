export type PagoRecord = {
  monto?: number | string
  notas?: string | null
  estado?: string | null
  metodo_pago?: string | null
  origen_fondos?: string | null
  tipo?: string | null
  id?: string
}

const toLower = (v: string | null | undefined) => v?.toLowerCase().trim()
// Criterio temporal: mientras no exista una marca estructurada del origen del
// movimiento, estos patrones exactos emitidos por el sistema se excluyen del
// reconocimiento de "ingreso real" a saldo a favor.
export const PATRONES_NOTAS_AJUSTE_NO_INGRESO_SALDO_A_FAVOR = [
  "ajuste de aplicacion de saldo a favor",
  "ajuste de aplicación de saldo a favor",
  "ajuste de saldo a favor por edicion del abono",
  "ajuste de saldo a favor por edición del abono",
  "reversion automatica por anulacion del anticipo",
  "reversion automatica por eliminacion del anticipo",
]

export const esAnuladoPorNota = (p: { notas?: string | null }) => !!p.notas?.includes('[ANULADO]')
export const esAnuladoCompleto = (p: { notas?: string | null; estado?: string | null }) =>
  esAnuladoPorNota(p) || toLower(p.estado) === 'anulado'
export const esSaldoAFavor = (p: { metodo_pago?: string | null; origen_fondos?: string | null }) =>
  toLower(p.metodo_pago) === 'saldo_a_favor' || toLower(p.origen_fondos) === 'saldo_a_favor'
export const esAplicacionSaldo = (p: { tipo?: string | null }) => toLower(p.tipo) === 'aplicacion_saldo'
export const esPagoValido = (p: { notas?: string | null; estado?: string | null }) => !esAnuladoCompleto(p)
export const esPagoDeSaldoAFavor = (p: {
  metodo_pago?: string | null
  origen_fondos?: string | null
  tipo?: string | null
}) => esSaldoAFavor(p) || esAplicacionSaldo(p)

export const esIngresoRealSaldoAFavor = (p: {
  tipo?: string | null
  notas?: string | null
  estado?: string | null
}) => {
  if (!esPagoValido(p)) return false
  if (toLower(p.tipo) !== "ingreso") return false

  const nota = toLower(p.notas) || ""
  return !PATRONES_NOTAS_AJUSTE_NO_INGRESO_SALDO_A_FAVOR.some((pattern) => nota.includes(pattern))
}

export const toSafeNumber = (value: unknown): number => {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num)) {
    console.warn('[contable] valor no numerico, usando 0', value)
    return 0
  }
  return num
}

export const parseMoneyInput = (value: unknown): number | null => {
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') return null

  const cleaned = value
    .trim()
    .replace(/\s+/g, '')
    .replace(/\$/g, '')

  if (!cleaned) return null
  if (!/^-?[\d.,]+$/.test(cleaned)) return null

  const negative = cleaned.startsWith('-')
  const unsigned = negative ? cleaned.slice(1) : cleaned
  if (!unsigned || !/\d/.test(unsigned)) return null

  const dotCount = (unsigned.match(/\./g) || []).length
  const commaCount = (unsigned.match(/,/g) || []).length

  const parseWithDecimal = (raw: string, decimalSeparator: '.' | ',') => {
    const thousandsSeparator = decimalSeparator === '.' ? ',' : '.'
    const parts = raw.split(decimalSeparator)
    if (parts.length > 2) return null

    const [integerPartRaw, decimalPartRaw] = parts
    const integerPart = integerPartRaw.split(thousandsSeparator).join('')
    if (!/^\d+$/.test(integerPart)) return null

    if (decimalPartRaw === undefined) {
      const result = Number(integerPart)
      return Number.isFinite(result) ? result : null
    }

    if (!/^\d+$/.test(decimalPartRaw)) return null
    const result = Number(`${integerPart}.${decimalPartRaw}`)
    return Number.isFinite(result) ? result : null
  }

  let normalized: number | null = null

  if (dotCount > 0 && commaCount > 0) {
    const lastDot = unsigned.lastIndexOf('.')
    const lastComma = unsigned.lastIndexOf(',')
    normalized = parseWithDecimal(unsigned, lastDot > lastComma ? '.' : ',')
  } else if (dotCount > 0 || commaCount > 0) {
    const separator = dotCount > 0 ? '.' : ','
    const parts = unsigned.split(separator)

    if (parts.length === 2) {
      const [head, tail] = parts
      if (tail.length === 3 && /^\d+$/.test(head) && /^\d+$/.test(tail)) {
        normalized = Number(parts.join(''))
      } else {
        normalized = parseWithDecimal(unsigned, separator)
      }
    } else if (parts.length > 2) {
      const last = parts[parts.length - 1]
      const allNumeric = parts.every((part) => /^\d+$/.test(part))
      if (!allNumeric) return null

      if (last.length <= 2) {
        normalized = Number(`${parts.slice(0, -1).join('')}.${last}`)
      } else if (parts.slice(1).every((part) => part.length === 3)) {
        normalized = Number(parts.join(''))
      } else {
        return null
      }
    } else {
      normalized = Number(unsigned)
    }
  } else {
    normalized = Number(unsigned)
  }

  if (normalized === null || !Number.isFinite(normalized)) return null
  return negative ? normalized * -1 : normalized
}

export function filtrarPagosValidosCuentas<T extends PagoRecord>(pagos: T[] = []): T[] {
  return pagos.filter((p) => esPagoValido(p))
}

export function filtrarIngresosRealesSaldoAFavor<T extends PagoRecord>(movimientos: T[] = []): T[] {
  return movimientos.filter((mov) => esIngresoRealSaldoAFavor(mov))
}

export function filtrarIngresosOperativos<T extends PagoRecord>(
  pagos: T[] = [],
  opts: { excluirSaldoAFavor?: boolean; excluirAplicacionSaldo?: boolean } = {}
): T[] {
  const { excluirSaldoAFavor = true, excluirAplicacionSaldo = true } = opts
  return pagos.filter((p) => {
    if (!esPagoValido(p)) return false
    if (excluirSaldoAFavor && esSaldoAFavor(p)) return false
    if (excluirAplicacionSaldo && esAplicacionSaldo(p)) return false
    return true
  })
}

export const filtrarPagosValidos = filtrarPagosValidosCuentas

export const sumarMontos = (pagos: PagoRecord[] = []) =>
  pagos.reduce((sum, p) => {
    const monto = toSafeNumber(p.monto)
    return sum + monto
  }, 0)

export const totalPagosValidos = (
  pagos: PagoRecord[] = [],
  opts: { incluirSaldoAFavor?: boolean } = { incluirSaldoAFavor: true }
) => {
  const { incluirSaldoAFavor = true } = opts
  const filtrados = filtrarPagosValidosCuentas(
    pagos.filter((p) => {
      if (!incluirSaldoAFavor && esPagoDeSaldoAFavor(p)) return false
      return true
    })
  )
  return sumarMontos(filtrados)
}

export const calcularEstadoCuenta = (valorTotal: number, totalAbonado: number): 'pendiente' | 'parcial' | 'pagado' => {
  if (totalAbonado >= valorTotal) return 'pagado'
  if (totalAbonado > 0) return 'parcial'
  return 'pendiente'
}

export const calcularEstadoCuentaDesdePagos = (
  valorTotal: number,
  pagos: PagoRecord[] = [],
  opts: { incluirSaldoAFavor?: boolean } = { incluirSaldoAFavor: true }
) => {
  const totalValido = totalPagosValidos(pagos, opts)
  return calcularEstadoCuenta(toSafeNumber(valorTotal), totalValido)
}

export const calcularPendienteCuenta = (
  valorTotal: number,
  pagos: PagoRecord[] = [],
  opts: { incluirSaldoAFavor?: boolean } = { incluirSaldoAFavor: true }
) => {
  const totalValido = totalPagosValidos(pagos, opts)
  const pendiente = toSafeNumber(valorTotal) - totalValido
  return Math.max(0, pendiente)
}

export const calcularPendienteDespuesDeAbono = (
  valorTotal: number,
  pagos: PagoRecord[] = [],
  abonoId: string,
  montoNuevo: number
) => {
  const validos = filtrarPagosValidosCuentas(pagos)
  const otros = validos.filter((p) => p.id !== abonoId)
  const totalOtros = sumarMontos(otros)
  const pendiente = toSafeNumber(valorTotal) - totalOtros
  return { pendiente, excede: toSafeNumber(montoNuevo) > pendiente }
}
