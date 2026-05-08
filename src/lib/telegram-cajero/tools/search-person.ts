import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

const CANDIDATE_LIMIT = 1200

const NON_PERSON_WORDS = new Set([
  "a",
  "al",
  "algo",
  "aparece",
  "asistente",
  "asistentes",
  "abono",
  "abonos",
  "busca",
  "caja",
  "cajero",
  "cajerito",
  "coach",
  "codigo",
  "cod",
  "compra",
  "compras",
  "comprada",
  "compradas",
  "comprado",
  "comprados",
  "consulta",
  "cuadro",
  "cuenta",
  "cuentas",
  "cuanto",
  "cuanta",
  "cuantas",
  "cuando",
  "de",
  "debe",
  "deben",
  "debia",
  "deuda",
  "dime",
  "dijo",
  "dicho",
  "el",
  "ella",
  "en",
  "encuentra",
  "encontre",
  "encontraste",
  "estado",
  "esta",
  "este",
  "favor",
  "fecha",
  "fechas",
  "fue",
  "general",
  "habias",
  "hay",
  "hizo",
  "hicieron",
  "la",
  "las",
  "le",
  "lo",
  "los",
  "mas",
  "me",
  "mira",
  "no",
  "nombre",
  "pago",
  "pagos",
  "para",
  "pendiente",
  "pendientes",
  "persona",
  "por",
  "que",
  "queda",
  "quedan",
  "registrada",
  "registradas",
  "registrado",
  "registrados",
  "restante",
  "restantes",
  "revisa",
  "saldo",
  "sesion",
  "sesiones",
  "su",
  "sus",
  "tiene",
  "tienen",
  "tomo",
  "tomar",
  "tomaron",
  "tuvo",
  "ultima",
  "ultimo",
  "ver",
  "verifica",
  "y",
])

type PersonRow = {
  id: string
  nombre: string
  codigo?: string | null
  cedula?: string | null
}

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value: string) {
  return normalize(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !NON_PERSON_WORDS.has(token))
}

function tokenMatchesName(token: string, nameTokens: string[], normalizedName: string) {
  if (normalizedName.includes(token)) return true
  return nameTokens.some((nameToken) => {
    if (nameToken === token) return true
    if (token.length >= 4 && nameToken.includes(token)) return true
    if (nameToken.length >= 4 && token.includes(nameToken)) return true
    return false
  })
}

function scorePerson(row: PersonRow, rawTerm: string, tokens: string[]) {
  const normalizedTerm = normalize(rawTerm)
  const normalizedName = normalize(row.nombre || "")
  const nameTokens = normalizedName.split(" ").filter(Boolean)
  const codigo = normalize(String(row.codigo || ""))
  const cedula = normalize(String(row.cedula || ""))

  if (!normalizedTerm) return 0

  if (codigo && (normalizedTerm === codigo || tokens.includes(codigo))) return 1000
  if (cedula && (normalizedTerm === cedula || tokens.includes(cedula))) return 1000

  const usableTokens = tokens.length ? tokens : tokenize(normalizedTerm)
  if (!usableTokens.length || !normalizedName) return 0

  const matchedTokens = usableTokens.filter((token) => tokenMatchesName(token, nameTokens, normalizedName))
  const requiredMatches = usableTokens.length === 1 ? 1 : Math.min(2, usableTokens.length)
  if (matchedTokens.length < requiredMatches) return 0

  const compactQuery = usableTokens.join(" ")
  let score = matchedTokens.length * 25
  score += Math.round((matchedTokens.length / usableTokens.length) * 20)

  if (normalizedName === compactQuery) score += 80
  else if (normalizedName.includes(compactQuery)) score += 35

  if (usableTokens[0] && nameTokens[0] === usableTokens[0]) score += 10
  score -= Math.max(0, usableTokens.length - matchedTokens.length) * 4
  score -= Math.abs(nameTokens.length - matchedTokens.length)

  return score
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

  if (/^\d+$/.test(normalized)) {
    const { data, error } = await supabase
      .from("asistentes")
      .select("id, nombre, codigo, cedula")
      .or(`codigo.eq.${normalized},cedula.eq.${normalized}`)
      .limit(limit)

    if (error) return toolError("searchPerson", queryScope, "asistentes", error)

    const rows = data || []
    return toolResult({
      toolName: "searchPerson",
      status: rows.length === 0 ? "empty" : rows.length > 1 ? "ambiguous" : "ok",
      queryScope: { ...queryScope, normalized, strategy: "codigo_cedula" },
      sources: ["asistentes"],
      resultCount: rows.length,
      data: rows,
    })
  }

  const { data, error } = await supabase
    .from("asistentes")
    .select("id, nombre, codigo, cedula")
    .order("nombre", { ascending: true })
    .limit(CANDIDATE_LIMIT)

  if (error) return toolError("searchPerson", queryScope, "asistentes", error)

  const tokens = tokenize(term)
  const ranked = ((data || []) as PersonRow[])
    .map((row) => ({ row, score: scorePerson(row, term, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || normalize(a.row.nombre).localeCompare(normalize(b.row.nombre)))
    .slice(0, limit)
    .map((item) => item.row)

  return toolResult({
    toolName: "searchPerson",
    status: ranked.length === 0 ? "empty" : ranked.length > 1 ? "ambiguous" : "ok",
    queryScope: { ...queryScope, normalized, tokens, strategy: "token_ranked_name_search" },
    sources: ["asistentes"],
    resultCount: ranked.length,
    data: ranked,
    explanationHints: ranked.length === 0 ? ["No hubo coincidencias por nombre, codigo o cedula."] : [],
  })
}
