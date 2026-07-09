import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

// Limpia el término para usarlo dentro de un filtro .or() de PostgREST
// (las comas y paréntesis rompen el filtro).
function sanitizeTerm(term: string) {
  return (term || "")
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Lista TODAS las personas que compraron/iniciaron un concepto o producto
 * (p. ej. "pasos", "primer paso", "curso de milagros"), buscando en el texto
 * de las cuentas por cobrar sin importar mayúsculas ni variantes singular/plural
 * (paso/pasos). Devuelve la lista deduplicada por persona; NO es por persona.
 */
export async function getConceptBuyers(supabase: SupabaseReader, term: string, limit = 500) {
  const raw = sanitizeTerm(term)
  const queryScope = { term: raw }

  if (raw.length < 3) {
    return toolResult({
      toolName: "getConceptBuyers",
      status: "empty",
      queryScope,
      sources: [],
      resultCount: 0,
      data: { term: raw, total_personas: 0, personas: [] },
      explanationHints: ["El concepto es muy corto; pide una palabra mas especifica."],
    })
  }

  // Coincide con el término y su variante singular/plural (paso/pasos).
  const base = raw.toLowerCase()
  const patterns = new Set<string>([base])
  if (base.endsWith("s")) patterns.add(base.slice(0, -1))
  else patterns.add(base + "s")
  const orFilter = Array.from(patterns).map((pattern) => `concepto.ilike.%${pattern}%`).join(",")

  const { data, error } = await supabase
    .from("cuentas_por_cobrar")
    .select("asistente_id, concepto, fecha_emision, asistentes(nombre, codigo)")
    .or(orFilter)
    .order("fecha_emision", { ascending: true })
    .limit(2000)

  if (error) return toolError("getConceptBuyers", queryScope, "cuentas_por_cobrar", error)

  const byPerson = new Map<string, { nombre: string; codigo: string | null; veces: number; primera_fecha: string | null }>()
  for (const row of (data as any[]) || []) {
    const id = row.asistente_id
    if (!id) continue
    const asistente = row.asistentes || {}
    const existing = byPerson.get(id)
    if (existing) {
      existing.veces += 1
    } else {
      byPerson.set(id, {
        nombre: asistente.nombre || "Asistente",
        codigo: asistente.codigo ?? null,
        veces: 1,
        primera_fecha: row.fecha_emision ?? null,
      })
    }
  }

  const personas = Array.from(byPerson.values()).sort((a, b) => {
    const ca = Number(a.codigo)
    const cb = Number(b.codigo)
    if (Number.isFinite(ca) && Number.isFinite(cb)) return ca - cb
    return String(a.nombre).localeCompare(String(b.nombre))
  })

  return toolResult({
    toolName: "getConceptBuyers",
    status: personas.length ? "ok" : "empty",
    queryScope: { ...queryScope, patterns: Array.from(patterns) },
    sources: ["cuentas_por_cobrar", "asistentes"],
    resultCount: personas.length,
    data: {
      term: raw,
      total_personas: personas.length,
      total_cuentas: ((data as any[]) || []).length,
      personas: personas.slice(0, limit),
    },
  })
}
