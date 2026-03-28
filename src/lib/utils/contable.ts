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

// --- Flags básicos ---
export const esAnuladoPorNota = (p: { notas?: string | null }) => !!p.notas?.includes('[ANULADO]')
export const esAnuladoCompleto = (p: { notas?: string | null; estado?: string | null }) =>
  esAnuladoPorNota(p) || toLower(p.estado) === 'anulado'
export const esSaldoAFavor = (p: { metodo_pago?: string | null; origen_fondos?: string | null }) =>
  toLower(p.metodo_pago) === 'saldo_a_favor' || toLower(p.origen_fondos) === 'saldo_a_favor'
export const esAplicacionSaldo = (p: { tipo?: string | null }) => toLower(p.tipo) === 'aplicacion_saldo'
export const esPagoValido = (p: { notas?: string | null; estado?: string | null }) => !esAnuladoCompleto(p)
export const esPagoDeSaldoAFavor = (p: { metodo_pago?: string | null; origen_fondos?: string | null; tipo?: string | null }) =>
  esSaldoAFavor(p) || esAplicacionSaldo(p)

export const toSafeNumber = (value: unknown): number => {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num)) {
    console.warn('[contable] valor no numérico, usando 0', value)
    return 0
  }
  return num
}

// --- Filtros específicos ---
// Uso actual en cuentas / asistente: excluye anulados (estado o nota)
export function filtrarPagosValidosCuentas<T extends PagoRecord>(pagos: T[] = []): T[] {
  return pagos.filter((p) => esPagoValido(p))
}

// Uso potencial en dashboard/liquidaciones: excluye anulados por estado o nota y exclusiones de saldo_a_favor / aplicacion_saldo
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

// Alias para compatibilidad con llamadas existentes
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
