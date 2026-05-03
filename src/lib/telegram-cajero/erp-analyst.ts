import { normalizeText } from "./input"
import type { TelegramSessionState } from "./memory"

type StructuredResult = NonNullable<TelegramSessionState["lastStructuredResult"]>
type WorkspaceEntity = NonNullable<NonNullable<TelegramSessionState["conversationWorkspace"]>["activeEntities"]>[number]

export type AnalystDecision =
  | { kind: "answer"; text: string }
  | { kind: "tool"; tool: "open_receivables" | "summary_month" | "business_alerts" }
  | { kind: "clarify"; text: string }
  | { kind: "compare_periods"; text: string }
  | { kind: "none" }

function money(value: unknown) {
  const amount = Math.round(Number(value || 0))
  return `$${amount.toLocaleString("es-CO")}`
}

function amountFromItem(item: Record<string, unknown>) {
  return Number(item.pendiente ?? item.monto ?? item.valor ?? item.valor_total ?? 0) || 0
}

function itemLabel(item: Record<string, unknown>, fallback = "Concepto") {
  return String(item.concepto || item.nombre || item.label || fallback)
}

function describeResult(result: StructuredResult) {
  const name = result.asistente?.nombre ? `${result.asistente.nombre} ` : ""
  const total = result.totals?.pendiente ?? result.totals?.total ?? result.totals?.ingresos_operativos
  const items = result.items || []
  const lines = [`Esto es lo que tengo del último resultado: ${name}${result.type}.`]
  if (typeof total === "number") lines.push(`Total principal: ${money(total)}.`)
  if (items.length) {
    lines.push(`Incluye ${items.length} item(s):`)
    lines.push(...items.slice(0, 6).map((item) => `- ${itemLabel(item)}: ${money(amountFromItem(item))}`))
  }
  if (result.sources?.length) lines.push(`Fuentes: ${result.sources.join(", ")}.`)
  return lines.join("\n")
}

function sumResult(result: StructuredResult) {
  const items = result.items || []
  const total = result.totals?.pendiente ?? items.reduce((acc, item) => acc + amountFromItem(item), 0)
  const subject = result.asistente?.nombre ? `${result.asistente.nombre} ` : ""
  const parts = items.map((item) => money(amountFromItem(item)))
  return [
    `En total ${subject}debe ${money(total)}.`,
    parts.length ? `La suma sale de: ${parts.join(" + ")} = ${money(total)}.` : "",
  ].filter(Boolean).join("\n")
}

function observeResult(result: StructuredResult) {
  const items = [...(result.items || [])].sort((a, b) => amountFromItem(b) - amountFromItem(a))
  const total = result.totals?.pendiente ?? items.reduce((acc, item) => acc + amountFromItem(item), 0)
  const lines = [`Observo un total principal de ${money(total)}.`]
  if (items.length) {
    const top = items[0]
    lines.push(`Lo más grande a revisar es ${itemLabel(top)} por ${money(amountFromItem(top))}.`)
    if (items.length > 1) lines.push(`Hay ${items.length} item(s); conviene priorizar los de mayor pendiente y confirmar pagos recientes antes de cobrar.`)
  }
  return lines.join("\n")
}

function ordinalIndex(text: string) {
  const normalized = normalizeText(text)
  if (/\b(primera|primero|1)\b/.test(normalized)) return 0
  if (/\b(segunda|segundo|2)\b/.test(normalized)) return 1
  if (/\b(tercera|tercero|3)\b/.test(normalized)) return 2
  return null
}

function activeEntities(state: TelegramSessionState): WorkspaceEntity[] {
  return state.conversationWorkspace?.activeEntities || []
}

function explainEntity(entity: WorkspaceEntity, index: number) {
  const total = entity.totals?.pendiente ?? entity.totals?.total ?? 0
  const items = entity.items || []
  return [
    `${index + 1}. ${entity.nombre}: ${money(total)}${entity.lastQuery ? ` (${entity.lastQuery})` : ""}.`,
    items.length ? items.slice(0, 4).map((item) => `- ${itemLabel(item)}: ${money(amountFromItem(item))}`).join("\n") : "",
  ].filter(Boolean).join("\n")
}

export function analyzeErpQuestion(text: string, state: TelegramSessionState = {}): AnalystDecision {
  const normalized = normalizeText(text)
  const last = state.lastStructuredResult || null
  const entities = activeEntities(state)

  if (/\b(compara|comparame|comparalos|comparalas).*(dos|personas|ellas|ellos)\b/.test(normalized) && entities.length >= 2) {
    const sorted = [...entities].sort((a, b) => (b.totals?.pendiente || 0) - (a.totals?.pendiente || 0))
    return { kind: "answer", text: ["Comparacion de lo revisado:", ...sorted.map((entity) => `- ${entity.nombre}: ${money(entity.totals?.pendiente || 0)}`)].join("\n") }
  }

  if (/\b(cual|cuál)\s+(esta|está)\s+peor\b/.test(normalized) && entities.length >= 2) {
    const sorted = [...entities].sort((a, b) => (b.totals?.pendiente || 0) - (a.totals?.pendiente || 0))
    return { kind: "answer", text: `La situacion mas pesada es ${sorted[0].nombre}: ${money(sorted[0].totals?.pendiente || 0)} pendiente.` }
  }

  if (/\b(quien|quién|cual|cuál)\s+debe\s+mas\b/.test(normalized)) {
    if (entities.length >= 2) {
      const sorted = [...entities].sort((a, b) => (b.totals?.pendiente || 0) - (a.totals?.pendiente || 0))
      const top = sorted[0]
      return { kind: "answer", text: `De lo que hemos revisado, quien más debe es ${top.nombre}: ${money(top.totals?.pendiente || 0)}.` }
    }
    return { kind: "tool", tool: "open_receivables" }
  }

  if (/\b(como vamos|cómo vamos|cuanto entro|cuánto entró|resumen).*(mes|este mes)\b/.test(normalized)) {
    return { kind: "tool", tool: "summary_month" }
  }

  if (/\b(compara|comparame|compárame).*(mes|anterior|periodo|período)\b/.test(normalized)) {
    return { kind: "compare_periods", text: "Puedo comparar períodos, pero necesito que me digas cuáles dos períodos quieres cruzar o que esté disponible el resumen anterior en la conversación." }
  }

  if (/\bsuma\s+las?\s+3\b/.test(normalized)) {
    const selected = entities.slice(-3)
    if (selected.length < 3) return { kind: "clarify", text: "Tengo menos de 3 personas/resultados claros en la conversación. Dime cuáles tres quieres sumar." }
    const total = selected.reduce((acc, entity) => acc + (entity.totals?.pendiente || 0), 0)
    return {
      kind: "answer",
      text: [`La suma de esas 3 da ${money(total)}.`, ...selected.map((entity) => `- ${entity.nombre}: ${money(entity.totals?.pendiente || 0)}`)].join("\n"),
    }
  }

  if (/\bsuma\s+(los|las)\s+dos\b|\bsuma\s+esas\b|\bsuma\s+esos\b/.test(normalized)) {
    const selected = /\bdos\b/.test(normalized) ? entities.slice(-2) : entities
    if (selected.length < 2) return { kind: "clarify", text: "Necesito al menos dos resultados claros para sumarlos. Dime cuales personas quieres sumar." }
    const total = selected.reduce((acc, entity) => acc + (entity.totals?.pendiente || 0), 0)
    return { kind: "answer", text: [`La suma da ${money(total)}.`, ...selected.map((entity) => `- ${entity.nombre}: ${money(entity.totals?.pendiente || 0)}`)].join("\n") }
  }

  const index = ordinalIndex(normalized)
  if (index !== null && /\b(explica|explicame|explícame|segunda|primera|tercera)\b/.test(normalized)) {
    if (!entities[index]) return { kind: "clarify", text: "No tengo esa posición clara en la conversación. ¿Te refieres a una persona o a una cuenta específica?" }
    return { kind: "answer", text: explainEntity(entities[index], index) }
  }

  if (/\b(que esta raro|que ves raro|alertas?)\b/.test(normalized)) {
    return { kind: "tool", tool: "business_alerts" }
  }

  if (/\b(que observas|qué observas|ves algo|que deberia revisar|qué debería revisar|observa)\b/.test(normalized)) {
    if (entities.length >= 2) {
      const sorted = [...entities].sort((a, b) => (b.totals?.pendiente || 0) - (a.totals?.pendiente || 0))
      return {
        kind: "answer",
        text: [
          `Viendo lo conversado, revisaría primero a ${sorted[0].nombre} por ${money(sorted[0].totals?.pendiente || 0)}.`,
          `Total entre entidades activas: ${money(sorted.reduce((acc, entity) => acc + (entity.totals?.pendiente || 0), 0))}.`,
          "Conviene confirmar pagos recientes antes de cobrar y priorizar los pendientes más altos.",
        ].join("\n"),
      }
    }
    if (last) return { kind: "answer", text: observeResult(last) }
  }

  if (/\b(en total|total|cuanto da|cuánto da|suma eso|entonces cuanto|entonces cuánto)\b/.test(normalized)) {
    if (last) return { kind: "answer", text: sumResult(last) }
    return { kind: "clarify", text: "No tengo un resultado anterior claro para sumar. ¿Quieres que revise una persona o la cartera pendiente?" }
  }

  if (/\b(explica|explicame|explícame|que significa|qué significa|hazme un resumen|resumen de todo)\b/.test(normalized)) {
    if (entities.length >= 2 && /\btodo\b/.test(normalized)) {
      return { kind: "answer", text: ["Resumen de lo visto:", ...entities.map((entity, index) => explainEntity(entity, index))].join("\n") }
    }
    if (last) return { kind: "answer", text: describeResult(last) }
    return { kind: "clarify", text: "¿Quieres que revise una persona, cartera pendiente, ingresos/egresos o liquidaciones?" }
  }

  return { kind: "none" }
}

export function mergeWorkspaceEntity(state: TelegramSessionState, entity: WorkspaceEntity): TelegramSessionState["conversationWorkspace"] {
  const workspace = state.conversationWorkspace || {}
  const current = workspace.activeEntities || []
  const key = entity.id ? `${entity.type}:${entity.id}` : `${entity.type}:${entity.nombre}`
  const filtered = current.filter((item) => (item.id ? `${item.type}:${item.id}` : `${item.type}:${item.nombre}`) !== key)
  return {
    ...workspace,
    activeEntities: [...filtered, entity].slice(-6),
    threadSummary: entity.lastQuery ? `${entity.nombre}: ${entity.lastQuery}` : workspace.threadSummary || null,
  }
}
