import type { AiPlannerPlan } from "./ai-planner"
import type { ToolExecutionBundle, ToolExecutionItem } from "./tool-executor"
import type { TelegramSessionState } from "./memory"
import type { TelegramConfig } from "./types"
import { toSafeNumber } from "@/lib/utils/contable"

function formatCop(value: unknown) {
  return `$${Math.round(toSafeNumber(value)).toLocaleString("es-CO")}`
}

function amountFromItem(item: Record<string, unknown>) {
  return toSafeNumber(item.pendiente ?? item.monto ?? item.valor ?? item.valor_total ?? item.total ?? 0)
}

function labelFromItem(item: Record<string, unknown>, fallback = "Item") {
  return String(item.concepto || item.nombre || item.fecha || item.label || fallback)
}

function getCalculationText(plan: AiPlannerPlan, state: TelegramSessionState, bundle: ToolExecutionBundle) {
  const structured = bundle.structuredResults.length ? bundle.structuredResults : state.lastStructuredResult ? [state.lastStructuredResult] : []
  const workspace = state.conversationWorkspace?.activeEntities || []

  if (plan.calculation === "sum") {
    if (workspace.length >= 2 && plan.useWorkspace) {
      const selected = /\bdos\b/.test(plan.responseInstruction) ? workspace.slice(-2) : workspace
      const total = selected.reduce((acc, entity) => acc + toSafeNumber(entity.totals?.pendiente ?? entity.totals?.total ?? 0), 0)
      return [`La suma da ${formatCop(total)}.`, ...selected.map((entity) => `- ${entity.nombre}: ${formatCop(entity.totals?.pendiente ?? entity.totals?.total ?? 0)}`)].join("\n")
    }
    const last = structured[structured.length - 1]
    if (last) {
      const items = last.items || []
      const total = toSafeNumber(last.totals?.pendiente ?? last.totals?.total ?? items.reduce((acc, item) => acc + amountFromItem(item), 0))
      const parts = items.map((item) => formatCop(amountFromItem(item)))
      return [
        `En total${last.asistente?.nombre ? ` ${last.asistente.nombre}` : ""} da ${formatCop(total)}.`,
        parts.length ? `La suma sale de: ${parts.join(" + ")} = ${formatCop(total)}.` : "",
      ].filter(Boolean).join("\n")
    }
  }

  if (plan.calculation === "analyze" || plan.calculation === "compare") {
    if (workspace.length >= 2) {
      const sorted = [...workspace].sort((a, b) => toSafeNumber(b.totals?.pendiente ?? b.totals?.total) - toSafeNumber(a.totals?.pendiente ?? a.totals?.total))
      const total = sorted.reduce((acc, entity) => acc + toSafeNumber(entity.totals?.pendiente ?? entity.totals?.total), 0)
      return [
        `Viendo lo conversado, yo revisaria primero a ${sorted[0].nombre}: ${formatCop(sorted[0].totals?.pendiente ?? sorted[0].totals?.total)}.`,
        `Total entre entidades activas: ${formatCop(total)}.`,
        "Conviene confirmar pagos recientes antes de cobrar y priorizar los pendientes mas altos.",
      ].join("\n")
    }
    const last = structured[structured.length - 1]
    if (last) {
      const items = [...(last.items || [])].sort((a, b) => amountFromItem(b) - amountFromItem(a))
      const total = toSafeNumber(last.totals?.pendiente ?? last.totals?.total ?? last.totals?.ingresos_operativos ?? 0)
      return [
        `Observo un total principal de ${formatCop(total)}.`,
        items[0] ? `Lo mas grande a revisar es ${labelFromItem(items[0])} por ${formatCop(amountFromItem(items[0]))}.` : "",
        items.length > 1 ? `Hay ${items.length} item(s); revisaria primero los de mayor monto o antiguedad.` : "",
      ].filter(Boolean).join("\n")
    }
  }

  if (plan.calculation === "explain") {
    const last = structured[structured.length - 1]
    if (last) {
      return [
        `Esto corresponde a ${last.type}${last.asistente?.nombre ? ` de ${last.asistente.nombre}` : ""}.`,
        last.totals ? `Totales principales: ${Object.entries(last.totals).map(([key, value]) => `${key}: ${formatCop(value)}`).join(", ")}.` : "",
        last.items?.length ? `Incluye ${last.items.length} item(s), por ejemplo ${labelFromItem(last.items[0])}.` : "",
        last.sources?.length ? `Fuentes consultadas: ${last.sources.join(", ")}.` : "",
      ].filter(Boolean).join("\n")
    }
  }

  return null
}

function describePersonFinancial(item: ToolExecutionItem) {
  const data: any = item.result?.data || {}
  const cuentas = Array.isArray(data.cuentas) ? data.cuentas : []
  const pendientes = cuentas.filter((cuenta: any) => Number(cuenta.pendiente || 0) > 0)
  const name = item.person?.nombre || data.asistente?.nombre || "la persona"
  return [
    `Listo, revise a ${name}.`,
    `Facturado: ${formatCop(data.total_facturado)}. Abonado: ${formatCop(data.total_abonado)}. Pendiente: ${formatCop(data.total_pendiente)}.`,
    toSafeNumber(data.saldo_a_favor) > 0 ? `Saldo a favor: ${formatCop(data.saldo_a_favor)}.` : "",
    pendientes.length
      ? ["Cuentas pendientes:", ...pendientes.slice(0, 6).map((cuenta: any) => `- ${cuenta.concepto}: ${formatCop(cuenta.pendiente)}`)].join("\n")
      : "No veo cuentas pendientes.",
  ].filter(Boolean).join("\n")
}

function describePayments(item: ToolExecutionItem) {
  const rows: any[] = Array.isArray(item.result?.data) ? item.result!.data as any[] : []
  const name = item.person?.nombre || "la persona"
  if (!rows.length) return `No veo pagos validos recientes para ${name}.`
  return [`Ultimos pagos de ${name}:`, ...rows.slice(0, 6).map((pago) => `- ${pago.fecha_pago}: ${formatCop(pago.monto)} ${pago.metodo_pago || ""} | ${pago.concepto || ""}`)].join("\n")
}

function describeCoach(item: ToolExecutionItem) {
  const data: any = item.result?.data || {}
  const name = item.person?.nombre || "la persona"
  const sesiones = Array.isArray(data.sesiones) ? data.sesiones : []
  const fechasTomadas = Array.isArray(data.fechas_tomadas) ? data.fechas_tomadas : sesiones.map((sesion: any) => sesion.fecha).filter(Boolean).reverse()
  const paquetes = Array.isArray(data.paquetes) ? data.paquetes : []
  const estado = data.interpretacion?.estado || null
  return [
    `Sesiones coach de ${name}:`,
    `Compradas: ${data.sesiones_compradas || 0}. Tomadas/registradas: ${data.sesiones_realizadas || 0}. Restantes: ${data.sesiones_restantes || 0}.`,
    estado === "con_sesiones_restantes" ? "Estado: aun tiene sesiones disponibles." : estado === "sin_sesiones_restantes" ? "Estado: no quedan sesiones disponibles registradas." : "Estado: no veo paquete coach registrado.",
    fechasTomadas.length
      ? ["Fechas tomadas:", ...fechasTomadas.slice(0, 20).map((fecha: string, index: number) => `${index + 1}. ${fecha}`)].join("\n")
      : "No veo fechas de sesiones tomadas en el contador actual.",
    sesiones[0] ? `Ultima registrada: ${sesiones[0].fecha}${sesiones[0].notas ? ` | ${sesiones[0].notas}` : ""}.` : "",
    paquetes.length ? `Paquetes registrados: ${paquetes.length}.` : "",
    "Puede haber sesiones antiguas no cargadas en el contador si no fueron migradas al modulo coach.",
  ].filter(Boolean).join("\n")
}

function describePurchases(item: ToolExecutionItem) {
  const rows: any[] = Array.isArray(item.result?.data) ? item.result!.data as any[] : []
  const name = item.person?.nombre || "la persona"
  if (!rows.length) return `No veo cuentas o conceptos comprados para ${name}.`
  return [`Esto tiene registrado ${name}:`, ...rows.slice(0, 7).map((row) => `- ${row.concepto}: ${formatCop(row.valor_total)} | abonado ${formatCop(row.abonado)} | pendiente ${formatCop(row.pendiente)}`)].join("\n")
}

function describeSummary(item: ToolExecutionItem) {
  const data: any = item.result?.data || {}
  return [
    "Resumen del periodo:",
    `Ingresos operativos: ${formatCop(data.ingresos_operativos)}.`,
    `Egresos: ${formatCop(data.egresos)}.`,
    `Utilidad estimada: ${formatCop(data.utilidad_estimada)}.`,
  ].join("\n")
}

function describeAlerts(item: ToolExecutionItem) {
  const alerts: any[] = Array.isArray(item.result?.data) ? item.result!.data as any[] : []
  if (!alerts.length) return "No veo alertas claras con los datos consultados."
  return ["Esto conviene revisar:", ...alerts.slice(0, 5).map((alert) => `- ${alert.type}: ${alert.evidence?.[0] || "sin evidencia"}`)].join("\n")
}

function describeFullProfile(item: ToolExecutionItem) {
  const data: any = item.result?.data || {}
  return [
    describePersonFinancial({ ...item, result: { ...item.result!, data: data.financial } }),
    describePurchases({ ...item, result: { ...item.result!, data: data.purchases } }),
    describePayments({ ...item, result: { ...item.result!, data: data.payments } }),
    describeCoach({ ...item, result: { ...item.result!, data: data.coach } }),
  ].filter(Boolean).join("\n\n")
}

export function buildDeterministicResponse(plan: AiPlannerPlan, bundle: ToolExecutionBundle, state: TelegramSessionState = {}) {
  if (bundle.status === "ambiguous" && bundle.pendingSelection?.matches.length) {
    return [
      "Encontré varias coincidencias; elige una para no mezclar datos:",
      ...bundle.pendingSelection.matches.map((match, index) => `${index + 1}. ${match.nombre}${match.codigo ? ` | codigo ${match.codigo}` : ""}`),
    ].join("\n")
  }

  const calculation = getCalculationText(plan, state, bundle)
  if (calculation) return calculation

  if (!bundle.results.length) {
    return plan.clarification || "Puedo revisar una persona, cartera pendiente, pagos, ingresos/egresos o liquidaciones. ¿Que dato quieres mirar?"
  }

  const parts = bundle.results.map((item) => {
    if (item.status === "empty") return item.userSafeMessage || "No encontre datos para esa consulta."
    if (item.status === "error") return item.result?.userSafeErrors.join(" ") || "No pude consultar esa seccion."
    if (item.requestedTool === "getPersonFinancialStatus") return describePersonFinancial(item)
    if (item.requestedTool === "getPersonPayments" || item.requestedTool === "getPersonLastPayment") return describePayments(item)
    if (item.requestedTool === "getCoachSessions") return describeCoach(item)
    if (item.requestedTool === "getPersonPurchasesOrConcepts") return describePurchases(item)
    if (item.requestedTool === "getPersonFullProfile") return describeFullProfile(item)
    if (item.requestedTool === "getSummary") return describeSummary(item)
    if (item.requestedTool === "getBusinessAlerts") return describeAlerts(item)
    if (item.requestedTool === "getOpenReceivablesSummary") {
      const data: any = item.result?.data || {}
      const top = Array.isArray(data.top_personas) ? data.top_personas : []
      return [
        `Veo ${data.personas_con_deuda || 0} persona(s) con saldo pendiente. Total cartera: ${formatCop(data.total_cartera)}.`,
        ...top.slice(0, 8).map((row: any, index: number) => `${index + 1}. ${row.nombre}: ${formatCop(row.pendiente)} (${row.cuentas} cuenta(s))`),
      ].join("\n")
    }
    return item.result?.resultCount ? `Consulté ${item.requestedTool}: ${item.result.resultCount} resultado(s).` : item.userSafeMessage || "No encontre datos claros."
  })

  const partial = bundle.userSafeErrors.length ? `\n\nOjo: resultado parcial. ${Array.from(new Set(bundle.userSafeErrors)).join(" ")}` : ""
  return parts.filter(Boolean).join("\n\n") + partial
}

function shouldUseDeepSeekForWriting(plan: AiPlannerPlan, bundle: ToolExecutionBundle) {
  if (bundle.status === "ambiguous") return false
  if (plan.needsCalculation || plan.calculation === "analyze" || plan.calculation === "compare" || plan.calculation === "explain") return true
  if (bundle.results.length > 1) return true
  if (plan.intent === "estado_completo_persona" || plan.intent === "cartera_pendiente_global" || plan.intent === "resumen_periodo" || plan.intent === "sesiones_coach_persona") return true
  return false
}

function advancedWritingNeeded(plan: AiPlannerPlan, text: string) {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  return Boolean(plan.needsCalculation || plan.calculation || /\b(analiza|analizalo|compara|explica|explicame|que observas|que ves|revisar primero|esta raro|coach|sesiones|fechas)\b/.test(normalized))
}

async function callDeepSeekWriter({
  text,
  plan,
  bundle,
  state,
  config,
  fallback,
  advanced,
}: {
  text: string
  plan: AiPlannerPlan
  bundle: ToolExecutionBundle
  state: TelegramSessionState
  config: TelegramConfig
  fallback: string
  advanced: boolean
}) {
  const { apiKey, baseUrl, model } = config.deepseek || {}
  if (!apiKey || !baseUrl || !model) return null

  const body: Record<string, unknown> = {
    model,
    temperature: advanced ? 0.15 : 0.05,
    messages: [
      {
        role: "system",
        content:
          "Eres Cajero, especialista en sesiones coach y analista interno del ERP. Redacta corto, claro y natural para Telegram. Para sesiones coach, siempre explica compradas, tomadas/registradas, restantes, fechas tomadas, ultima sesion y si puede haber sesiones antiguas no cargadas. Usa solo los datos JSON entregados. No inventes cifras, nombres, fechas ni pagos. Si falta informacion, dilo claramente. No sugieras escrituras automaticas.",
      },
      {
        role: "user",
        content: JSON.stringify({
          pregunta: text,
          plan,
          memoria: {
            lastAsistente: state.lastAsistente || null,
            lastIntent: state.lastIntent || null,
          },
          resultados_reales: bundle.results.map((item) => ({
            tool: item.requestedTool,
            status: item.result?.status || item.status,
            person: item.person || null,
            data: item.result?.data ?? null,
            errors: item.result?.userSafeErrors || [],
            sources: item.result?.provenance.sources || [],
          })),
          calculo_deterministico: getCalculationText(plan, state, bundle),
          fallback_seguro: fallback,
        }),
      },
    ],
  }

  if (advanced) {
    body.thinking = { type: "enabled" }
    body.reasoning_effort = "max"
  } else {
    body.thinking = { type: "disabled" }
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    console.error("[telegram-cajero] ai-response-writer DeepSeek no-ok", { status: response.status, model, advanced })
    return null
  }
  const json = await response.json()
  const content = json?.choices?.[0]?.message?.content
  return typeof content === "string" && content.trim() ? content.trim() : null
}

export async function writeAiResponse({
  text,
  plan,
  bundle,
  state = {},
  config,
}: {
  text: string
  plan: AiPlannerPlan
  bundle: ToolExecutionBundle
  state?: TelegramSessionState
  config: TelegramConfig
}) {
  const fallback = buildDeterministicResponse(plan, bundle, state)
  const { apiKey, baseUrl, model } = config.deepseek || {}
  if (!apiKey || !baseUrl || !model) return fallback
  if (!shouldUseDeepSeekForWriting(plan, bundle)) return fallback

  try {
    const advanced = advancedWritingNeeded(plan, text)
    const content = await callDeepSeekWriter({ text, plan, bundle, state, config, fallback, advanced })
    if (content) return content

    if (advanced) {
      const basicRetry = await callDeepSeekWriter({ text, plan, bundle, state, config, fallback, advanced: false })
      if (basicRetry) return basicRetry
    }

    return fallback
  } catch (error: any) {
    console.error("[telegram-cajero] ai-response-writer fallo; usando plantilla", { message: error?.message })
    return fallback
  }
}
