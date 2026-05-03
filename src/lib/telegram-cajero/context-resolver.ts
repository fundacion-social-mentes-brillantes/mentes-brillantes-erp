import { normalizeText } from "./input"
import type { DeepSeekIntent } from "./types"

export type LastAsistenteRef = {
  id: string
  nombre: string
  codigo?: string | null
  cedula?: string | null
}

export type ResolvedTelegramContext = {
  intent: DeepSeekIntent | "context_help"
  secondaryIntents: DeepSeekIntent[]
  personQuery: string | null
  useLastAsistente: boolean
  needsPersonClarification: boolean
}

function stripAddressing(text: string) {
  return text.replace(/^(cajero|cajerito|caja)\b[:,]?\s*/i, "").replace(/@cajero_mb_pagos_bot/gi, "").trim()
}

function cleanPersonQuery(text: string, patterns: RegExp[]) {
  let term = stripAddressing(text).replace(/\?+$/g, " ").trim()
  for (const pattern of patterns) term = term.replace(pattern, " ")
  term = term
    .replace(/\b(de|a|la|el|los|las|por|para|en|y|o|su|sus|ella|lo|que|compro|compro)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  return term.length >= 2 ? term : null
}

export function hasContextPronoun(text: string) {
  const normalized = normalizeText(text)
  return /\b(su|sus|ella|esa persona|la misma|el mismo)\b/.test(normalized)
}

export function isContextHelp(text: string) {
  const normalized = normalizeText(text)
  return normalized === "?" || normalized === "no entendi" || normalized === "no entiendo"
}

export function shouldUseLastAsistenteForText(text: string) {
  const normalized = normalizeText(text)
  return (
    hasContextPronoun(text) ||
    /^(y\s+)?(sus\s+)?(lo que compro|que compro|que tiene comprado)\b/.test(normalized) ||
    /^(y\s+)(sus\s+)?(pagos|abonos|cuanto debe|deuda|saldo|saldo a favor|cuentas|compras|conceptos|ultimo pago|cuando pago|toda la informacion|muestrame todo|que mas sabes)\b/.test(
      normalized
    )
  )
}

export function resolveTelegramContext(
  text: string,
  context: { lastAsistente?: LastAsistenteRef | null } = {}
): ResolvedTelegramContext | null {
  const original = stripAddressing(text)
  const normalized = normalizeText(original)
  if (!normalized) return null

  if (isContextHelp(original)) {
    return {
      intent: "context_help",
      secondaryIntents: [],
      personQuery: null,
      useLastAsistente: false,
      needsPersonClarification: false,
    }
  }

  if (
    /\b(quien|quienes|personas|lista|mayores|cartera|cuentas pendientes generales|que nos deben)\b/.test(normalized) &&
    /\b(debe|deben|deuda|dinero|pendiente|pendientes|deudores|cartera)\b/.test(normalized)
  ) {
    return {
      intent: "cartera_pendiente_global",
      secondaryIntents: [],
      personQuery: null,
      useLastAsistente: false,
      needsPersonClarification: false,
    }
  }

  const wantsComplete =
    /\b(toda la informacion|ficha|resumen completo|estado completo|datos completos|que sabes|revisa completo|muestrame todo|que mas sabes)\b/.test(
      normalized
    )
  const wantsPurchases =
    /\b(que compro|lo que compro|que tiene comprado|conceptos|compras|cuentas|que pago|ha comprado)\b/.test(normalized)
  const wantsLastPayment = /\b(ultimo pago|pago mas reciente|cuando pago|cuando fue.*pago)\b/.test(normalized)
  const wantsPayments = /\b(pagos|abonos)\b/.test(normalized)
  const wantsDebt = /\b(cuanto debe|debe|deuda|pendiente)\b/.test(normalized)
  const wantsBalance = /\b(saldo a favor|saldo)\b/.test(normalized)

  const secondaryIntents: DeepSeekIntent[] = []
  if (wantsLastPayment) secondaryIntents.push("ultimo_pago_persona")
  if (wantsPurchases) secondaryIntents.push("compras_persona")

  let intent: DeepSeekIntent | null = null
  if (wantsComplete) intent = "estado_completo_persona"
  else if (wantsLastPayment) intent = "ultimo_pago_persona"
  else if (wantsPurchases) intent = "compras_persona"
  else if (wantsPayments) intent = "pagos_persona"
  else if (wantsDebt) intent = "cuentas_pendientes_persona"
  else if (wantsBalance) intent = "saldo_favor_persona"

  if (!intent) return null

  const explicitPersonQuery = hasContextPronoun(original) ? null : cleanPersonQuery(original, [
        /muestrame/gi,
        /toda la informacion/gi,
        /estado completo/gi,
        /resumen completo/gi,
        /datos completos/gi,
        /que sabes/gi,
        /revisa completo/gi,
        /cuanto debe|debe|deuda|pendiente/gi,
        /ultimo pago|pago mas reciente|cuando pago/gi,
        /pagos|abonos|saldo a favor|saldo|conceptos|compras|cuentas|que compro|lo que compro/gi,
      ])
  const useLastAsistente = shouldUseLastAsistenteForText(original) && !explicitPersonQuery
  const personQuery = useLastAsistente ? null : explicitPersonQuery

  return {
    intent,
    secondaryIntents: Array.from(new Set(secondaryIntents.filter((item) => item !== intent))),
    personQuery,
    useLastAsistente,
    needsPersonClarification: useLastAsistente && !context.lastAsistente,
  }
}
