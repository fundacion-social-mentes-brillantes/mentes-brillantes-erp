import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

// Periodos contables (abiertos/cerrados). Opcionalmente filtra por estado.
export async function getPeriods(supabase: SupabaseReader, estado?: string | null) {
  const queryScope = { estado: estado || null }
  let query = supabase
    .from("periodos")
    .select("id, nombre, fecha_inicio, fecha_fin, estado")
    .order("fecha_inicio", { ascending: false })
    .limit(12)
  if (estado) query = query.eq("estado", estado)

  const { data, error } = await query
  if (error) return toolError("getPeriods", queryScope, "periodos", error)

  const rows = data || []
  return toolResult({
    toolName: "getPeriods",
    status: rows.length === 0 ? "empty" : "ok",
    queryScope,
    sources: ["periodos"],
    resultCount: rows.length,
    data: {
      periodos: rows.map((row: any) => ({
        nombre: row.nombre,
        estado: row.estado,
        fecha_inicio: row.fecha_inicio,
        fecha_fin: row.fecha_fin,
      })),
    },
  })
}
