import { secretoCoincide } from "@/lib/seguridad/secretos"

// Autenticacion de la integracion con la agenda. Es un secreto compartido y no
// OAuth porque quien llama es el SERVIDOR de la agenda, no una persona.
// Vive en un solo sitio para que no haya dos versiones de la comprobacion.

export function secretoAgendaValido(req: Request): boolean {
  return secretoCoincide(req.headers.get("x-agenda-secret"), process.env.AGENDA_SHARED_SECRET)
}

export function respuestaNoAutorizada() {
  return Response.json({ error: "no_autorizado" }, { status: 401, headers: { "Cache-Control": "no-store" } })
}

export const CABECERAS_SIN_CACHE = { "Cache-Control": "no-store" } as const
