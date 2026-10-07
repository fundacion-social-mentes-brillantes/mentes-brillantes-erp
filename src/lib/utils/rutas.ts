/**
 * Devuelve la ruta solo si es de ESTE sitio ("/cuentas/123"); si no, null.
 *
 * Revisar `startsWith("/")` no basta: "//otro-sitio.com" y "/\otro-sitio.com"
 * tambien empiezan por "/" y el navegador los toma como otro dominio. Con eso,
 * un enlace armado con ?returnTo=//otro-sitio.com mandaba a la persona fuera
 * del ERP despues de guardar (redireccion abierta).
 */
export function rutaInternaSegura(ruta: unknown): string | null {
  if (typeof ruta !== "string") return null
  const limpia = ruta.trim()
  if (!limpia.startsWith("/")) return null
  if (limpia.startsWith("//") || limpia.startsWith("/\\")) return null
  if (/[\u0000-\u001f\\]/.test(limpia)) return null
  try {
    // Si al resolverla contra un origen ficticio cambia de origen, no es interna.
    const url = new URL(limpia, "https://erp.invalid")
    if (url.origin !== "https://erp.invalid") return null
    return url.pathname + url.search + url.hash
  } catch {
    return null
  }
}
