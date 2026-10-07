// A donde volver despues de iniciar sesion. Solo se acepta una ruta de este
// mismo ERP: "/cuentas" si, pero "@otro.com", "//otro.com" o "https://otro.com"
// no, porque pegados detras del dominio mandarian a la persona a otra pagina.
export function rutaInternaSegura(destino: string | null | undefined): string {
  if (!destino || !destino.startsWith("/")) return "/"
  if (destino.startsWith("//") || destino.startsWith("/\\")) return "/"
  return destino
}
