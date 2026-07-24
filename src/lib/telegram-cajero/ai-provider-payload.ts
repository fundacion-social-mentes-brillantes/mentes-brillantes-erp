export const AI_PROVIDER_MAX_ARRAY_ITEMS = 20
export const AI_PROVIDER_MAX_STRING_CHARS = 600
export const AI_PROVIDER_MAX_TOTAL_CHARS = 24_000

const MAX_OBJECT_KEYS = 40
const MAX_DEPTH = 7

function normalizeKey(key: string) {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function isSensitiveKey(key: string) {
  const normalized = normalizeKey(key)
  return (
    /^(nota|notas|note|notes|observacion|observaciones|observation|observations)$/.test(normalized) ||
    /(cedula|documento|document|contacto|contact|email|correo|direccion|address|telefono|phone|celular)/.test(normalized) ||
    /token/.test(normalized) ||
    /^(compradornombre|nombrecomprador)$/.test(normalized)
  )
}

type PayloadBudget = {
  remaining: number
}

function consume(budget: PayloadBudget, amount: number) {
  budget.remaining = Math.max(0, budget.remaining - Math.max(0, amount))
}

function minimizeValue(
  value: unknown,
  budget: PayloadBudget,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (budget.remaining <= 0 || depth > MAX_DEPTH) return undefined
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    consume(budget, String(value).length + 1)
    return value
  }
  if (typeof value === "bigint") {
    const text = String(value)
    consume(budget, text.length + 2)
    return text
  }
  if (typeof value === "string") {
    const available = Math.max(0, Math.min(AI_PROVIDER_MAX_STRING_CHARS, budget.remaining - 2))
    if (!available) return undefined
    const text = value.slice(0, available)
    consume(budget, text.length + 2)
    return text
  }
  if (typeof value !== "object") return undefined

  const objectValue = value as object
  if (seen.has(objectValue)) return undefined
  seen.add(objectValue)

  if (Array.isArray(value)) {
    consume(budget, 2)
    const output: unknown[] = []
    for (const item of value.slice(0, AI_PROVIDER_MAX_ARRAY_ITEMS)) {
      const minimized = minimizeValue(item, budget, depth + 1, seen)
      if (minimized !== undefined) output.push(minimized)
      if (budget.remaining <= 0) break
    }
    return output
  }

  const output: Record<string, unknown> = {}
  consume(budget, 2)
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS)) {
    if (isSensitiveKey(key)) continue
    consume(budget, key.length + 4)
    const minimized = minimizeValue(child, budget, depth + 1, seen)
    if (minimized !== undefined) output[key] = minimized
    if (budget.remaining <= 0) break
  }
  return output
}

/**
 * Reduce el contexto que sale hacia un proveedor de IA. El resultado conserva
 * datos financieros útiles, pero elimina campos sensibles y acota colecciones
 * y texto para impedir que una respuesta grande exponga filas innecesarias.
 */
export function minimizeAiProviderPayload(payload: unknown): unknown {
  const budgets = [
    AI_PROVIDER_MAX_TOTAL_CHARS - 2_000,
    Math.floor(AI_PROVIDER_MAX_TOTAL_CHARS / 2),
    Math.floor(AI_PROVIDER_MAX_TOTAL_CHARS / 4),
  ]

  for (const available of budgets) {
    const minimized = minimizeValue(payload, { remaining: available }, 0, new WeakSet<object>()) ?? null
    if (JSON.stringify(minimized).length <= AI_PROVIDER_MAX_TOTAL_CHARS) return minimized
  }

  return { contenido_omitido_por_limite: true }
}
