/**
 * Error cuyo mensaje esta redactado para mostrarselo a la persona: dice por
 * que se rechazo la operacion y que puede hacer. La marca `esParaUsuario`
 * permite al MCP entregarlo tal cual en vez del mensaje generico de error
 * interno, que dejaba a la gente sin saber como continuar.
 */
export class OperacionError extends Error {
  readonly esParaUsuario = true
}

export function exigir(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new OperacionError(mensaje)
}

export function exigirMontoPositivo(monto: unknown, etiqueta = "El monto"): number {
  const n = Number(monto)
  if (!Number.isFinite(n) || n <= 0) {
    throw new OperacionError(`${etiqueta} debe ser mayor a 0.`)
  }
  return n
}

export function exigirFechaIso(fecha: unknown, etiqueta = "La fecha"): string {
  const s = String(fecha || "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new OperacionError(`${etiqueta} debe tener el formato AAAA-MM-DD.`)
  }
  return s
}
