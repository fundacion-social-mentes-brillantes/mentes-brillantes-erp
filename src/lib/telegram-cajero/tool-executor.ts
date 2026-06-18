import { resolveNaturalDateRange } from "./dates"
import type { TelegramSessionState } from "./memory"
import type { PendingAction } from "./types"
import type { AiPlannerPlan, AiPlannerTool } from "./ai-planner"
import { isAllowedToolName, TOOL_LIMIT, type AllowedToolName } from "./tool-catalog"
import {
  getBusinessAlerts,
  getCounts,
  getDonationsSummary,
  getOpenReceivablesSummary,
  getPeriods,
  getPersonDonations,
  getPersonFinancialStatus,
  getPersonLastPayment,
  getPersonPayments,
  getPersonPurchasesOrConcepts,
  getSummary,
  searchGlobal,
  searchPerson,
  toolResult,
  type SupabaseReader,
  type ToolResult,
} from "./tools"
import { getCoachSessions } from "./tools/coach"
import { getExpenses } from "./tools/expenses"
import { getExternalSales } from "./tools/external-sales"
import { toSafeNumber } from "@/lib/utils/contable"

type AsistenteRef = { id: string; nombre: string; codigo?: string | null; cedula?: string | null }

export type ToolExecutionItem = {
  requestedTool: AllowedToolName
  status: ToolResult["status"]
  result?: ToolResult
  person?: AsistenteRef | null
  userSafeMessage?: string
}

export type ToolExecutionBundle = {
  status: "ok" | "partial" | "ambiguous" | "empty" | "error"
  results: ToolExecutionItem[]
  pendingSelection?: {
    action: PendingAction
    matches: Array<{ nombre: string; codigo?: string | null; cedula?: string | null }>
  } | null
  structuredResults: NonNullable<TelegramSessionState["lastStructuredResult"]>[]
  userSafeErrors: string[]
}

function moneyNumber(value: unknown) {
  return Math.round(toSafeNumber(value))
}

function stringArg(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberArg(args: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(args[key])
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
}

function dateRangeFromArgs(args: Record<string, unknown>, fallback: string) {
  const explicitFrom = stringArg(args, "fechaInicio")
  const explicitTo = stringArg(args, "fechaFin")
  if (explicitFrom && explicitTo) return { from: explicitFrom, to: explicitTo, label: `${explicitFrom} a ${explicitTo}` }
  const range = stringArg(args, "range")
  return resolveNaturalDateRange(range || fallback) || resolveNaturalDateRange(fallback)!
}

function actionFromTool(toolName: AllowedToolName): PendingAction {
  if (toolName === "getPersonPayments") return "pagos_persona"
  if (toolName === "getPersonLastPayment") return "ultimo_pago_persona"
  if (toolName === "getPersonPurchasesOrConcepts") return "compras_persona"
  if (toolName === "getPersonFullProfile") return "estado_completo_persona"
  if (toolName === "getCoachSessions") return "sesiones_coach_persona"
  return "cuentas_pendientes_persona"
}

async function resolvePerson(supabase: SupabaseReader, args: Record<string, unknown>) {
  const asistenteId = stringArg(args, "asistenteId")
  if (asistenteId) return { status: "ok" as const, person: { id: asistenteId, nombre: stringArg(args, "personName") || "Asistente" } as AsistenteRef }

  const personQuery = stringArg(args, "personQuery") || stringArg(args, "term")
  if (!personQuery) return { status: "empty" as const, message: "Falta persona para consultar." }

  const result = await searchPerson(supabase, personQuery, 5)
  if (result.status === "error") return { status: "error" as const, result }
  const matches = Array.isArray(result.data) ? result.data : []
  if (!matches.length) return { status: "empty" as const, result, message: `No encontre a ${personQuery} en asistentes.` }
  if (matches.length > 1) return { status: "ambiguous" as const, result, matches }
  return { status: "ok" as const, person: matches[0] as AsistenteRef }
}

async function getPersonFullProfile(supabase: SupabaseReader, person: AsistenteRef) {
  const [financial, purchases, payments, coach] = await Promise.all([
    getPersonFinancialStatus(supabase, person.id),
    getPersonPurchasesOrConcepts(supabase, person.id, 10),
    getPersonPayments(supabase, person.id, 5),
    getCoachSessions(supabase, person.id),
  ])
  const partial = [financial, purchases, payments, coach].some((result) => result.status === "partial" || result.status === "error")
  return toolResult({
    toolName: "getPersonFullProfile",
    status: partial ? "partial" : "ok",
    queryScope: { asistenteId: person.id },
    sources: [
      ...financial.provenance.sources,
      ...purchases.provenance.sources,
      ...payments.provenance.sources,
      ...coach.provenance.sources,
    ],
    resultCount: financial.resultCount + purchases.resultCount + payments.resultCount + coach.resultCount,
    data: { asistente: person, financial: financial.data, purchases: purchases.data, payments: payments.data, coach: coach.data },
    userSafeErrors: [...financial.userSafeErrors, ...purchases.userSafeErrors, ...payments.userSafeErrors, ...coach.userSafeErrors],
  })
}

async function executeTool(supabase: SupabaseReader, tool: AiPlannerTool): Promise<ToolExecutionItem> {
  const args = tool.args || {}
  const personTool = [
    "getPersonFinancialStatus",
    "getPersonPayments",
    "getPersonLastPayment",
    "getPersonPurchasesOrConcepts",
    "getPersonFullProfile",
    "getCoachSessions",
    "getPersonDonations",
  ].includes(tool.name)

  if (personTool) {
    const resolved = await resolvePerson(supabase, args)
    if (resolved.status === "ambiguous") {
      return {
        requestedTool: tool.name,
        status: "ambiguous",
        result: resolved.result,
        userSafeMessage: "Encontré varias coincidencias; necesito que elijas una para no mezclar datos.",
      }
    }
    if (resolved.status === "error") return { requestedTool: tool.name, status: "error", result: resolved.result }
    if (resolved.status === "empty") {
      return {
        requestedTool: tool.name,
        status: "empty",
        result: resolved.result,
        userSafeMessage: resolved.message,
      }
    }

    const person = resolved.person
    if (tool.name === "getPersonFinancialStatus") return { requestedTool: tool.name, status: "ok", person, result: await getPersonFinancialStatus(supabase, person.id) }
    if (tool.name === "getPersonPayments") return { requestedTool: tool.name, status: "ok", person, result: await getPersonPayments(supabase, person.id, numberArg(args, "limit", 10)) }
    if (tool.name === "getPersonLastPayment") return { requestedTool: tool.name, status: "ok", person, result: await getPersonLastPayment(supabase, person.id) }
    if (tool.name === "getPersonPurchasesOrConcepts") return { requestedTool: tool.name, status: "ok", person, result: await getPersonPurchasesOrConcepts(supabase, person.id, numberArg(args, "limit", 12)) }
    if (tool.name === "getPersonFullProfile") return { requestedTool: tool.name, status: "ok", person, result: await getPersonFullProfile(supabase, person) }
    if (tool.name === "getPersonDonations") return { requestedTool: tool.name, status: "ok", person, result: await getPersonDonations(supabase, person.id) }
    return { requestedTool: tool.name, status: "ok", person, result: await getCoachSessions(supabase, person.id) }
  }

  if (tool.name === "searchPerson") {
    const term = stringArg(args, "term") || stringArg(args, "personQuery") || ""
    const result = await searchPerson(supabase, term, numberArg(args, "limit", 5))
    return { requestedTool: tool.name, status: result.status, result }
  }
  if (tool.name === "getOpenReceivablesSummary") {
    const result = await getOpenReceivablesSummary(supabase, numberArg(args, "limit", 300))
    return { requestedTool: tool.name, status: result.status, result }
  }
  if (tool.name === "getSummary") {
    const range = dateRangeFromArgs(args, "este mes")
    const result = await getSummary(supabase, range.from, range.to)
    return { requestedTool: tool.name, status: result.status, result }
  }
  if (tool.name === "getBusinessAlerts") {
    const range = dateRangeFromArgs(args, "hoy")
    const result = await getBusinessAlerts(supabase, range.from, range.to)
    return { requestedTool: tool.name, status: result.status, result }
  }
  if (tool.name === "searchGlobal") {
    const result = await searchGlobal(supabase, stringArg(args, "term") || "")
    return { requestedTool: tool.name, status: result.status, result }
  }
  if (tool.name === "getExpenses") {
    const range = dateRangeFromArgs(args, "este mes")
    const result = await getExpenses(supabase, range.from, range.to)
    return { requestedTool: tool.name, status: result.status, result }
  }
  if (tool.name === "getExternalSales") {
    const range = dateRangeFromArgs(args, "este mes")
    const result = await getExternalSales(supabase, range.from, range.to)
    return { requestedTool: tool.name, status: result.status, result }
  }
  if (tool.name === "getDonationsSummary") {
    const range = dateRangeFromArgs(args, "este mes")
    const result = await getDonationsSummary(supabase, range.from, range.to)
    return { requestedTool: tool.name, status: result.status, result }
  }
  if (tool.name === "getCounts") {
    const result = await getCounts(supabase)
    return { requestedTool: tool.name, status: result.status, result }
  }
  if (tool.name === "getPeriods") {
    const result = await getPeriods(supabase, stringArg(args, "estado"))
    return { requestedTool: tool.name, status: result.status, result }
  }

  return {
    requestedTool: tool.name,
    status: "forbidden",
    result: toolResult({
      toolName: tool.name,
      status: "forbidden",
      queryScope: args,
      sources: [],
      resultCount: 0,
      data: null,
      userSafeErrors: ["Tool no permitida."],
      riskLevel: "medium",
    }),
  }
}

function structuredFromItem(item: ToolExecutionItem): NonNullable<TelegramSessionState["lastStructuredResult"]> | null {
  const result = item.result
  if (!result) return null
  const data: any = result.data || {}
  const person = item.person || data.asistente || null

  if (item.requestedTool === "getPersonFullProfile" && person) {
    const financial = data.financial || {}
    const purchases = Array.isArray(data.purchases) ? data.purchases : []
    const payments = Array.isArray(data.payments) ? data.payments : []
    const coach = data.coach || {}
    const cuentas = Array.isArray(financial.cuentas) ? financial.cuentas : []
    const pendientes = cuentas.filter((cuenta: any) => Number(cuenta.pendiente || 0) > 0)
    return {
      type: "estado_completo_persona",
      module: "asistentes",
      asistente: { id: person.id, nombre: person.nombre, codigo: person.codigo || null },
      totals: {
        pendiente: moneyNumber(financial.total_pendiente),
        facturado: moneyNumber(financial.total_facturado),
        abonado: moneyNumber(financial.total_abonado),
        saldo_a_favor: moneyNumber(financial.saldo_a_favor),
        sesiones_compradas: moneyNumber(coach.sesiones_compradas),
        sesiones_realizadas: moneyNumber(coach.sesiones_realizadas),
        sesiones_restantes: moneyNumber(coach.sesiones_restantes),
      },
      items: [
        ...pendientes.slice(0, 8).map((cuenta: any) => ({
          tipo: "cuenta_pendiente",
          concepto: cuenta.concepto,
          pendiente: moneyNumber(cuenta.pendiente),
          valor: moneyNumber(cuenta.valor),
          abonado: moneyNumber(cuenta.abonado),
        })),
        ...payments.slice(0, 5).map((pago: any) => ({
          tipo: "pago",
          fecha: pago.fecha_pago,
          monto: moneyNumber(pago.monto),
          metodo_pago: pago.metodo_pago || null,
          concepto: pago.concepto || null,
        })),
        ...purchases.slice(0, 5).map((row: any) => ({
          tipo: "compra",
          concepto: row.concepto,
          valor_total: moneyNumber(row.valor_total),
          pendiente: moneyNumber(row.pendiente),
          abonado: moneyNumber(row.abonado),
        })),
      ],
      sources: result.provenance.sources,
    }
  }

  if (item.requestedTool === "getPersonFinancialStatus" && person) {
    const cuentas = Array.isArray(data.cuentas) ? data.cuentas : []
    const pendientes = cuentas.filter((cuenta: any) => Number(cuenta.pendiente || 0) > 0)
    return {
      type: "cuentas_pendientes_persona",
      module: "asistentes",
      asistente: { id: person.id, nombre: person.nombre, codigo: person.codigo || null },
      totals: {
        pendiente: moneyNumber(data.total_pendiente),
        facturado: moneyNumber(data.total_facturado),
        abonado: moneyNumber(data.total_abonado),
        saldo_a_favor: moneyNumber(data.saldo_a_favor),
      },
      items: pendientes.map((cuenta: any) => ({
        concepto: cuenta.concepto,
        pendiente: moneyNumber(cuenta.pendiente),
        valor: moneyNumber(cuenta.valor),
        abonado: moneyNumber(cuenta.abonado),
      })),
      sources: result.provenance.sources,
    }
  }

  if (item.requestedTool === "getPersonPurchasesOrConcepts" && person) {
    const items = Array.isArray(data) ? data : []
    return {
      type: "compras_persona",
      module: "cuentas_por_cobrar",
      asistente: { id: person.id, nombre: person.nombre, codigo: person.codigo || null },
      totals: {
        total: items.reduce((acc: number, row: any) => acc + moneyNumber(row.valor_total), 0),
        pendiente: items.reduce((acc: number, row: any) => acc + moneyNumber(row.pendiente), 0),
      },
      items: items.map((row: any) => ({
        concepto: row.concepto,
        valor_total: moneyNumber(row.valor_total),
        pendiente: moneyNumber(row.pendiente),
        abonado: moneyNumber(row.abonado),
      })),
      sources: result.provenance.sources,
    }
  }

  if (item.requestedTool === "getCoachSessions" && person) {
    const sesiones = Array.isArray(data.sesiones) ? data.sesiones : []
    return {
      type: "sesiones_coach_persona",
      module: "coach",
      asistente: { id: person.id, nombre: person.nombre, codigo: person.codigo || null },
      totals: {
        sesiones_compradas: moneyNumber(data.sesiones_compradas),
        sesiones_realizadas: moneyNumber(data.sesiones_realizadas),
        sesiones_restantes: moneyNumber(data.sesiones_restantes),
      },
      items: sesiones.slice(0, 10).map((sesion: any) => ({ fecha: sesion.fecha, notas: sesion.notas || null })),
      sources: result.provenance.sources,
    }
  }

  if (item.requestedTool === "getSummary") {
    return {
      type: "resumen_periodo",
      module: "contabilidad",
      totals: {
        ingresos_operativos: moneyNumber(data.ingresos_operativos),
        egresos: moneyNumber(data.egresos),
        utilidad_estimada: moneyNumber(data.utilidad_estimada),
      },
      items: [],
      sources: result.provenance.sources,
    }
  }

  if (item.requestedTool === "getOpenReceivablesSummary") {
    return {
      type: "cartera_pendiente_global",
      module: "cuentas_por_cobrar",
      totals: {
        pendiente: moneyNumber(data.total_cartera),
        personas_con_deuda: moneyNumber(data.personas_con_deuda),
        cuentas_pendientes: moneyNumber(data.cuentas_pendientes),
      },
      items: Array.isArray(data.top_personas) ? data.top_personas : [],
      sources: result.provenance.sources,
    }
  }

  return null
}

export async function executeAiToolPlan(supabase: SupabaseReader, plan: AiPlannerPlan): Promise<ToolExecutionBundle> {
  const requestedTools = (plan.tools || []).filter((tool) => isAllowedToolName(tool.name)).slice(0, TOOL_LIMIT)
  const rejected = (plan.tools || []).filter((tool) => !isAllowedToolName(tool.name as any))
  const results: ToolExecutionItem[] = []
  const userSafeErrors: string[] = rejected.length ? ["Una tool solicitada no esta permitida y fue ignorada."] : []

  for (const tool of requestedTools) {
    const item = await executeTool(supabase, tool)
    results.push(item)
    if (item.result?.userSafeErrors?.length) userSafeErrors.push(...item.result.userSafeErrors)
    if (item.status === "ambiguous") {
      const matches = Array.isArray(item.result?.data) ? item.result!.data as any[] : []
      return {
        status: "ambiguous",
        results,
        pendingSelection: {
          action: actionFromTool(item.requestedTool),
          matches: matches.map((match) => ({ nombre: match.nombre, codigo: match.codigo || null, cedula: match.cedula || null })),
        },
        structuredResults: [],
        userSafeErrors,
      }
    }
  }

  const structuredResults = results.map(structuredFromItem).filter((result): result is NonNullable<TelegramSessionState["lastStructuredResult"]> => Boolean(result))
  const statuses = results.map((item) => item.result?.status || item.status)
  const status =
    statuses.some((status) => status === "error") ? "error" :
    statuses.some((status) => status === "partial") ? "partial" :
    statuses.length && statuses.every((status) => status === "empty") ? "empty" :
    "ok"

  return { status, results, pendingSelection: null, structuredResults, userSafeErrors }
}
