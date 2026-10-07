import { OperacionError } from "@/lib/operaciones/errores"
import { AuthzError } from "@/lib/utils/authz"
import { mensajeDeError } from "@/lib/utils/errores"

// Piezas comunes de las server actions: como se le devuelve un error a la
// pantalla y como se reconoce la "excepcion" con la que Next redirige.

export type ActionState = { error?: string; success?: boolean } | null

/**
 * El error que ve la persona. Los de reglas (OperacionError) y de permisos
 * (AuthzError) ya vienen redactados para ella; cualquier otro queda en el log
 * del servidor y se muestra su mensaje o el texto por defecto.
 */
export function errorDeAccion(error: unknown, porDefecto: string, contexto = "accion"): { error: string } {
  if (error instanceof OperacionError || error instanceof AuthzError) return { error: error.message }
  console.error(`[${contexto}]`, error)
  return { error: mensajeDeError(error, porDefecto) }
}

/** redirect() de Next lanza un error especial que no se debe tragar en un catch. */
export function esRedireccionNext(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")
}
