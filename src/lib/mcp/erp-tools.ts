import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveNaturalDateRange } from "@/lib/telegram-cajero/dates"
import {
  getBusinessAlerts,
  getConceptBuyers,
  getCounts,
  getDonationsSummary,
  getExpenses,
  getExternalSales,
  getOpenReceivablesSummary,
  getPartnerSettlement,
  getPeriods,
  getPersonDonations,
  getPersonFinancialStatus,
  getPersonLastPayment,
  getPersonPayments,
  getPersonPurchasesOrConcepts,
  getSummary,
  searchGlobal,
  searchPerson,
  type SupabaseReader,
} from "@/lib/telegram-cajero/tools"
import { getCoachSessions } from "@/lib/telegram-cajero/tools/coach"

// Todo el MCP es SOLO LECTURA sobre las finanzas. Reusa las mismas funciones
// que el bot de Telegram, así el MCP y el ERP nunca divergen en su lógica.

type ToolText = { content: { type: "text"; text: string }[]; isError?: boolean }

function ok(data: unknown): ToolText {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2)
  return { content: [{ type: "text", text }] }
}
function fail(message: string): ToolText {
  return { content: [{ type: "text", text: message }], isError: true }
}

function reader(): SupabaseReader | null {
  return createAdminClient() as unknown as SupabaseReader | null
}

function rango(args: { desde?: string; hasta?: string; rango?: string }) {
  if (args.desde && args.hasta) return { from: args.desde, to: args.hasta, label: `${args.desde} a ${args.hasta}` }
  const natural = args.rango ? resolveNaturalDateRange(args.rango) : null
  return natural || resolveNaturalDateRange("este mes")!
}

type Resolved =
  | { kind: "error"; message: string }
  | { kind: "none" }
  | { kind: "ambiguous"; matches: any[] }
  | { kind: "person"; person: any }

async function resolvePersona(supabase: SupabaseReader, persona: string): Promise<Resolved> {
  const result = await searchPerson(supabase, persona, 6)
  if (result.status === "error") return { kind: "error", message: "No se pudo buscar la persona." }
  const matches = Array.isArray(result.data) ? (result.data as any[]) : []
  if (!matches.length) return { kind: "none" }
  if (matches.length > 1) return { kind: "ambiguous", matches }
  return { kind: "person", person: matches[0] }
}

export function registerErpTools(server: McpServer) {
  const withPerson = (
    name: string,
    description: string,
    run: (supabase: SupabaseReader, personId: string, args: any) => Promise<any>
  ) => {
    server.tool(
      name,
      description,
      { persona: z.string().describe("Nombre, código o cédula de la persona"), limite: z.number().int().positive().optional() },
      async (args: any) => {
        const supabase = reader()
        if (!supabase) return fail("El servidor no está configurado (falta service role).")
        const resolved = await resolvePersona(supabase, String(args.persona || ""))
        if (resolved.kind === "error") return fail(resolved.message)
        if (resolved.kind === "none") return ok(`No encontré a "${args.persona}" en asistentes. Da nombre completo, código o cédula.`)
        if (resolved.kind === "ambiguous") {
          return ok({
            aviso: "Hay varias coincidencias; especifica el código para no mezclar datos.",
            coincidencias: resolved.matches.map((m: any) => ({ nombre: m.nombre, codigo: m.codigo, cedula: m.cedula })),
          })
        }
        const data = await run(supabase, resolved.person.id, args)
        return ok({ persona: { nombre: resolved.person.nombre, codigo: resolved.person.codigo }, resultado: data?.data ?? data })
      }
    )
  }

  const withRange = (
    name: string,
    description: string,
    run: (supabase: SupabaseReader, from: string, to: string) => Promise<any>
  ) => {
    server.tool(
      name,
      description,
      {
        desde: z.string().optional().describe("Fecha inicio YYYY-MM-DD"),
        hasta: z.string().optional().describe("Fecha fin YYYY-MM-DD"),
        rango: z.string().optional().describe("Rango natural, ej 'este mes', 'mayo 2026'"),
      },
      async (args: any) => {
        const supabase = reader()
        if (!supabase) return fail("El servidor no está configurado (falta service role).")
        const r = rango(args)
        const result = await run(supabase, r.from, r.to)
        return ok({ rango: r.label, resultado: result?.data ?? result })
      }
    )
  }

  // ---- Por persona ----
  withPerson("estado_persona", "Estado financiero de una persona: total facturado, abonado, pendiente y saldo a favor.", (s, id) => getPersonFinancialStatus(s, id))
  withPerson("pagos_persona", "Pagos/abonos recientes válidos de una persona.", (s, id, a) => getPersonPayments(s, id, a.limite || 12))
  withPerson("ultimo_pago_persona", "Último pago válido de una persona.", (s, id) => getPersonLastPayment(s, id))
  withPerson("compras_persona", "Cuentas/conceptos que ha comprado una persona, con abonado y pendiente.", (s, id, a) => getPersonPurchasesOrConcepts(s, id, a.limite || 15))
  withPerson("donaciones_persona", "Donaciones registradas de una persona.", (s, id) => getPersonDonations(s, id))
  withPerson("sesiones_coach_persona", "Sesiones coach de una persona (módulo nuevo + registros de migración) con fechas.", (s, id) => getCoachSessions(s, id))

  // ---- Global / por concepto ----
  server.tool(
    "compradores_de_concepto",
    "Lista TODAS las personas que compraron/iniciaron un concepto o producto (ej: 'pasos', 'curso de milagros', 'sesión coach').",
    { concepto: z.string().describe("Concepto o producto a buscar"), limite: z.number().int().positive().optional() },
    async (args: any) => {
      const supabase = reader()
      if (!supabase) return fail("El servidor no está configurado.")
      const result = await getConceptBuyers(supabase, String(args.concepto || ""), args.limite || 500)
      return ok(result.data)
    }
  )

  server.tool(
    "cartera_pendiente",
    "Cartera pendiente global: total por cobrar, cuántas personas deben y los mayores deudores.",
    { limite: z.number().int().positive().optional() },
    async (args: any) => {
      const supabase = reader()
      if (!supabase) return fail("El servidor no está configurado.")
      const result = await getOpenReceivablesSummary(supabase, args.limite || 300)
      return ok(result.data)
    }
  )

  server.tool(
    "conteos",
    "Conteos del ERP: asistentes activos/total y cuentas por cobrar pendientes.",
    {},
    async () => {
      const supabase = reader()
      if (!supabase) return fail("El servidor no está configurado.")
      const result = await getCounts(supabase)
      return ok(result.data)
    }
  )

  server.tool(
    "periodos",
    "Períodos/liquidaciones contables (abiertos y cerrados) con sus fechas.",
    { estado: z.enum(["abierto", "cerrado"]).optional() },
    async (args: any) => {
      const supabase = reader()
      if (!supabase) return fail("El servidor no está configurado.")
      const result = await getPeriods(supabase, args.estado)
      return ok(result.data)
    }
  )

  server.tool(
    "socios_liquidacion",
    "Socios y su reparto/liquidación más reciente (porcentaje, corresponde, adelantos, neto).",
    { socio: z.string().optional().describe("Nombre del socio (opcional)") },
    async (args: any) => {
      const supabase = reader()
      if (!supabase) return fail("El servidor no está configurado.")
      const result = await getPartnerSettlement(supabase, args.socio || null)
      return ok(result.data)
    }
  )

  server.tool(
    "buscar_global",
    "Búsqueda general en todo el ERP (asistentes, cuentas, pagos, etc.) por un término.",
    { termino: z.string().describe("Texto a buscar") },
    async (args: any) => {
      const supabase = reader()
      if (!supabase) return fail("El servidor no está configurado.")
      const result = await searchGlobal(supabase, String(args.termino || ""))
      return ok(result.data)
    }
  )

  // ---- Por rango de fechas ----
  withRange("resumen_periodo", "Resumen financiero de un rango: ingresos operativos, egresos y utilidad estimada.", (s, from, to) => getSummary(s, from, to))
  withRange("egresos", "Egresos activos de un rango de fechas.", (s, from, to) => getExpenses(s, from, to))
  withRange("ventas_externas", "Ventas externas activas de un rango de fechas.", (s, from, to) => getExternalSales(s, from, to))
  withRange("donaciones_resumen", "Total de donaciones válidas en un rango de fechas.", (s, from, to) => getDonationsSummary(s, from, to))
  withRange("alertas", "Alertas operativas a revisar (con evidencia) en un rango de fechas.", (s, from, to) => getBusinessAlerts(s, from, to))
}
