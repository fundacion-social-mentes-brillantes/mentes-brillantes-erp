type SupabaseClient = any

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[?¿¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function cleanConceptTerm(value: string) {
  const cleaned = value
    .replace(
      /\b(en el sistema|por favor|en total|del centro|de la empresa|ahora|hoy|completa|completo|entera|todos|todas|registrados|registradas|actualmente|hasta ahora|alguna vez|en algun momento|nombres|nombre|listado|lista|de las personas|de los)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim()
  const words = cleaned.split(" ").filter((word) => word.length >= 2).slice(0, 4)
  const term = words.join(" ").trim()
  return term.length >= 3 ? term : null
}

/**
 * Detecta preguntas del tipo "quiénes compraron / iniciaron / tienen <concepto>"
 * y devuelve el concepto a buscar; null si no aplica.
 */
export function detectConceptBuyers(question: string): string | null {
  const normalized = normalizeText(question)
  const listSignal = /\b(quien|quienes|personas|gente|lista|listado|cuales|todos|todas)\b/.test(normalized)
  const buyVerb = /\b(compr|inici|adquir|pidi|pagar|tien)/.test(normalized)
  const debtWords = /\b(debe|deben|deuda|deudas|pendiente|pendientes|deudores|dinero|cartera|saldo)\b/.test(normalized)
  if (!listSignal || !buyVerb || debtWords) return null
  const match = normalized.match(
    /\b(?:compr(?:aron|o|ado|aran)|inici(?:aron|o|ado|aran)|adquir(?:ieron|io)|pidieron|pidio|pagaron|tienen|tiene)\s+(?:el |la |los |las |su |sus |de |del |un |una )*(.+)$/
  )
  return match?.[1] ? cleanConceptTerm(match[1]) : null
}

function sanitizeTerm(term: string) {
  return (term || "").replace(/[(),]/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Arma un contexto con TODAS las personas que compraron/iniciaron un concepto,
 * para que el asistente IA responda el listado completo (no por persona).
 */
export async function buildConceptBuyersContext(supabase: SupabaseClient, question: string, concept: string) {
  const raw = sanitizeTerm(concept)
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

  if (error) {
    console.error("[asistente-ia] error consultando compradores de concepto", {
      concepto: raw,
      mensaje: error.message,
      codigo: error.code,
    })
    return {
      consulta: question,
      tipo: "compradores_concepto",
      error_consulta:
        "No se pudo consultar la lista de personas por ese concepto. Informa que no fue posible consultar la informacion y no des cifras en cero.",
    }
  }

  const byPerson = new Map<string, { nombre: string; codigo: string | null; veces: number }>()
  for (const row of (data as any[]) || []) {
    const id = row.asistente_id
    if (!id) continue
    const asistente = row.asistentes || {}
    const existing = byPerson.get(id)
    if (existing) existing.veces += 1
    else byPerson.set(id, { nombre: asistente.nombre || "Asistente", codigo: asistente.codigo ?? null, veces: 1 })
  }

  const personas = Array.from(byPerson.values()).sort((a, b) => {
    const ca = Number(a.codigo)
    const cb = Number(b.codigo)
    if (Number.isFinite(ca) && Number.isFinite(cb)) return ca - cb
    return String(a.nombre).localeCompare(String(b.nombre))
  })

  return {
    consulta: question,
    tipo: "compradores_concepto",
    modo: "solo_lectura",
    concepto_buscado: raw,
    instruccion:
      "Responde la LISTA COMPLETA de personas que compraron/iniciaron ese concepto. Es un listado por concepto, no de una sola persona. Enumera los nombres (con su codigo). Usa solo estos datos.",
    total_personas: personas.length,
    personas,
  }
}
