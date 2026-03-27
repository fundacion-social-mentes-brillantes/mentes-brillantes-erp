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
  pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0)

export const calcularEstadoCuenta = (valorTotal: number, totalAbonado: number): 'pendiente' | 'parcial' | 'pagado' => {
  if (totalAbonado >= valorTotal) return 'pagado'
  if (totalAbonado > 0) return 'parcial'
  return 'pendiente'
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
  const pendiente = valorTotal - totalOtros
  return { pendiente, excede: montoNuevo > pendiente }
}
