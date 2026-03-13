export function calcularEstadoCuenta(valorTotal: number, totalAbonado: number): 'pendiente' | 'parcial' | 'pagado' {
  if (totalAbonado >= valorTotal) return 'pagado'
  if (totalAbonado > 0) return 'parcial'
  return 'pendiente'
}
