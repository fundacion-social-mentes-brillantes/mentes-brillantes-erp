import { timingSafeEqual } from "node:crypto"

// Autenticacion de la integracion con la agenda. Es un secreto compartido y no
// OAuth porque quien llama es el SERVIDOR de la agenda, no una persona.
// Vive en un solo sitio para que no haya dos versiones de la comprobacion.

export function secretoAgendaValido(req: Request): boolean {
  const esperado = process.env.AGENDA_SHARED_SECRET
  if (!esperado) return false

  const recibido = req.headers.get("x-agenda-secret") || ""
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  // Longitudes distintas harian lanzar a timingSafeEqual.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function respuestaNoAutorizada() {
  return Response.json({ error: "no_autorizado" }, { status: 401, headers: { "Cache-Control": "no-store" } })
}

export const CABECERAS_SIN_CACHE = { "Cache-Control": "no-store" } as const
