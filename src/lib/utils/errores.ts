// Leer el mensaje de un error sin suponer de que tipo es. En TypeScript estricto
// lo que llega a un `catch` es `unknown`: puede ser un Error, un objeto de
// Supabase ({ message, code }) o incluso un texto suelto.

export function mensajeDeError(error: unknown, porDefecto = "Ocurrio un error inesperado."): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error.trim()) return error
  if (error && typeof error === "object" && "message" in error) {
    const mensaje = (error as { message?: unknown }).message
    if (typeof mensaje === "string" && mensaje.trim()) return mensaje
  }
  return porDefecto
}

/** El codigo de un error de Postgres/Supabase (p. ej. "23505"), si lo trae. */
export function codigoDeError(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const codigo = (error as { code?: unknown }).code
    return typeof codigo === "string" ? codigo : undefined
  }
  return undefined
}
