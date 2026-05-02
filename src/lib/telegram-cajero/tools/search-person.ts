import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

export async function searchPerson(supabase: SupabaseReader, term: string, limit = 5) {
  const queryScope = { term, limit }
  const normalized = normalize(term)
  if (!normalized) {
    return toolResult({
      toolName: "searchPerson",
      status: "empty",
      queryScope,
      sources: ["asistentes"],
      resultCount: 0,
      data: [],
      explanationHints: ["Falta nombre, codigo o cedula."],
    })
  }

  const query = /^\d+$/.test(normalized)
    ? supabase.from("asistentes").select("id, nombre, codigo, cedula").or(`codigo.eq.${normalized},cedula.eq.${normalized}`).limit(limit)
    : supabase.from("asistentes").select("id, nombre, codigo, cedula").ilike("nombre", `%${term}%`).limit(limit)

  const { data, error } = await query
  if (error) return toolError("searchPerson", queryScope, "asistentes", error)

  const rows = data || []
  return toolResult({
    toolName: "searchPerson",
    status: rows.length === 0 ? "empty" : rows.length > 1 ? "ambiguous" : "ok",
    queryScope,
    sources: ["asistentes"],
    resultCount: rows.length,
    data: rows,
  })
}
