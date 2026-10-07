import { timingSafeEqual } from "node:crypto"

/**
 * Compara un secreto recibido con el esperado sin delatar cuanto coinciden
 * (comparacion de tiempo constante). Si no hay secreto configurado, rechaza:
 * un endpoint sin llave nunca queda abierto por olvido.
 */
export function secretoCoincide(recibido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!esperado || !recibido) return false
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** El valor de un encabezado "Authorization: Bearer <token>", o null. */
export function tokenBearer(req: Request): string | null {
  const auth = req.headers.get("authorization") || ""
  const coincide = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return coincide ? coincide[1].trim() : null
}
