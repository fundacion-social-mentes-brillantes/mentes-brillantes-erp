import type { DbClient } from "@/lib/supabase/types"

// Limite de intentos para formularios publicos (el auto-registro).
//
// Se cuenta por CLAVE (p. ej. "codigo:42" e "ip:1.2.3.4"): si cualquiera de las
// claves ya llego al tope dentro de la ventana, se rechaza. Asi no sirve cambiar
// el correo para seguir probando cedulas contra el mismo codigo, ni cambiar el
// codigo desde la misma IP.
//
// Los intentos viven en la tabla registro_intentos (solo service_role), porque
// en Vercel cada instancia tiene su propia memoria y se reinicia sola. Si la
// tabla aun no existe (migracion pendiente) se usa la memoria como respaldo.

/** Una clave a vigilar y cuantos intentos admite dentro de la ventana. */
export type Limite = { clave: string; maximo: number }

const VENTANA_POR_DEFECTO = 15 * 60 * 1000
const memoria = new Map<string, number[]>()

function excedeEnMemoria(limites: Limite[], ventanaMs: number, ahora: number): boolean {
  let excede = false
  for (const { clave, maximo } of limites) {
    const recientes = (memoria.get(clave) || []).filter((t) => ahora - t < ventanaMs)
    if (recientes.length >= maximo) excede = true
    memoria.set(clave, [...recientes, ahora])
  }
  return excede
}

/**
 * Registra un intento para cada clave y dice si ALGUNA ya habia llegado al tope.
 * Se registra incluso cuando excede: insistir no reinicia la cuenta.
 */
export async function registrarIntentoYExcede(
  admin: DbClient | null,
  limites: Limite[],
  ventanaMs = VENTANA_POR_DEFECTO
): Promise<boolean> {
  const ahora = Date.now()
  const vigentes = limites.filter((l) => l.clave)
  const lista = [...new Set(vigentes.map((l) => l.clave))]
  if (!lista.length) return false
  if (!admin) return excedeEnMemoria(vigentes, ventanaMs, ahora)

  const desde = new Date(ahora - ventanaMs).toISOString()
  const { data, error } = await admin
    .from("registro_intentos")
    .select("clave")
    .in("clave", lista)
    .gte("creado_en", desde)

  if (error) {
    // La tabla aun no existe (42P01 en Postgres, PGRST205 en la API): respaldo en memoria.
    const faltaTabla = error.code === "42P01" || error.code === "PGRST205"
    if (!faltaTabla) console.error("[limite-intentos] no se pudo leer", { code: error.code })
    return excedeEnMemoria(vigentes, ventanaMs, ahora)
  }

  const conteo = new Map<string, number>()
  for (const fila of data || []) conteo.set(fila.clave, (conteo.get(fila.clave) || 0) + 1)
  const excede = vigentes.some(({ clave, maximo }) => (conteo.get(clave) || 0) >= maximo)

  const { error: insertError } = await admin.from("registro_intentos").insert(lista.map((clave) => ({ clave })))
  if (insertError) console.error("[limite-intentos] no se pudo registrar", { code: insertError.code })

  // Limpieza perezosa: lo de mas de un dia ya no sirve.
  await admin.from("registro_intentos").delete().lt("creado_en", new Date(ahora - 24 * 60 * 60 * 1000).toISOString())

  return excede
}

/** Olvida los intentos de estas claves (tras un registro exitoso). */
export async function limpiarIntentos(admin: DbClient | null, claves: string[]): Promise<void> {
  const lista = claves.filter(Boolean)
  for (const clave of lista) memoria.delete(clave)
  if (admin && lista.length) await admin.from("registro_intentos").delete().in("clave", lista)
}

/** La IP del visitante segun Vercel (el primer valor de x-forwarded-for). */
export function ipDeEncabezados(encabezados: { get(nombre: string): string | null }): string | null {
  const reenviada = encabezados.get("x-forwarded-for")
  const ip = (reenviada ? reenviada.split(",")[0] : encabezados.get("x-real-ip"))?.trim()
  return ip || null
}
