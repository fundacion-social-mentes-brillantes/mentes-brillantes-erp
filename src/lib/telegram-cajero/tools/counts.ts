import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

// Conteos de cabecera: asistentes activos/total y cuentas por cobrar pendientes.
// Usa count exacto sin traer filas (head: true).
export async function getCounts(supabase: SupabaseReader) {
  const queryScope = {}
  const [activosRes, totalRes, pendientesRes] = await Promise.all([
    supabase.from("asistentes").select("id", { count: "exact", head: true }).eq("activo", true),
    supabase.from("asistentes").select("id", { count: "exact", head: true }),
    supabase.from("cuentas_por_cobrar").select("id", { count: "exact", head: true }).in("estado", ["pendiente", "parcial"]),
  ])

  const errors = [activosRes.error, totalRes.error, pendientesRes.error].filter(Boolean)
  if (errors.length === 3) return toolError("getCounts", queryScope, "asistentes", errors[0])

  return toolResult({
    toolName: "getCounts",
    status: "ok",
    queryScope,
    sources: ["asistentes", "cuentas_por_cobrar"],
    resultCount: 1,
    data: {
      asistentes_activos: activosRes.error ? null : activosRes.count ?? null,
      asistentes_total: totalRes.error ? null : totalRes.count ?? null,
      cuentas_pendientes: pendientesRes.error ? null : pendientesRes.count ?? null,
    },
    userSafeErrors: errors.length ? ["Algun conteo no se pudo calcular."] : [],
  })
}
