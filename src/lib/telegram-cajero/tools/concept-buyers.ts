import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"
import { fetchPaginatedRows, partialPaginationMessage } from "./pagination"

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
  const parsedLimit = Math.floor(Number(limit))
  const resultLimit = Number.isFinite(parsedLimit) ? Math.min(2_000, Math.max(1, parsedLimit)) : 500
  const queryScope = { term: raw, limit: resultLimit }

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

  const result = await fetchPaginatedRows<any>((withExactCount) =>
    supabase
      .from("cuentas_por_cobrar")
      .select(
        "id, asistente_id, concepto, fecha_emision, asistentes(nombre, codigo)",
        withExactCount ? { count: "exact" } : undefined
      )
      .or(orFilter),
    { rowKey: "id" }
  )

  if (result.error && result.rows.length === 0) {
    return toolError("getConceptBuyers", queryScope, "cuentas_por_cobrar", result.error)
  }

  const byPerson = new Map<string, { nombre: string; codigo: string | null; veces: number; primera_fecha: string | null }>()
  for (const row of result.rows) {
    const id = row.asistente_id
    if (!id) continue
    const asistente = row.asistentes || {}
    const existing = byPerson.get(id)
    if (existing) {
      existing.veces += 1
      if (
        row.fecha_emision &&
        (!existing.primera_fecha || String(row.fecha_emision) < String(existing.primera_fecha))
      ) {
        existing.primera_fecha = row.fecha_emision
      }
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
  const personasMostradas = personas.slice(0, resultLimit)
  const sourceComplete = result.pagination.complete
  const listTruncated = personasMostradas.length < personas.length
  const paginationWarning = sourceComplete ? null : partialPaginationMessage("compradores de concepto", result.pagination)
  const listWarning = listTruncated
    ? `La lista de compradores se limito a ${personasMostradas.length} de ${personas.length} personas encontradas; el total indicado si es exacto.`
    : null
  const partial = !sourceComplete || listTruncated

  return toolResult({
    toolName: "getConceptBuyers",
    status: partial ? "partial" : personas.length ? "ok" : "empty",
    queryScope: { ...queryScope, patterns: Array.from(patterns), maxRows: result.pagination.maxRows },
    sources: ["cuentas_por_cobrar", "asistentes"],
    resultCount: personas.length,
    data: {
      term: raw,
      total_personas: sourceComplete ? personas.length : null,
      total_cuentas: sourceComplete ? result.rows.length : null,
      personas_en_filas_consultadas: personas.length,
      cuentas_consultadas: result.rows.length,
      personas_mostradas: personasMostradas.length,
      lista_truncada: listTruncated,
      personas: personasMostradas,
      pagination: result.pagination,
    },
    explanationHints: [paginationWarning, listWarning].filter((message): message is string => Boolean(message)),
    userSafeErrors: [paginationWarning, listWarning].filter((message): message is string => Boolean(message)),
  })
}
