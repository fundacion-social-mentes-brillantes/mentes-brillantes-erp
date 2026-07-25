import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
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
  getRecentMovements,
  getSummary,
  searchGlobal,
  searchPerson,
  type SupabaseReader,
  type ToolResult,
} from "@/lib/telegram-cajero/tools"
import { getCoachSessions } from "@/lib/telegram-cajero/tools/coach"
import { calcularDiferencias } from "@/lib/operaciones/agenda-sync"
import { auditMcpToolCall, McpAuditError } from "./audit"
import { sanitizeMcpData } from "./privacy"
import { MCP_PRIMARY_SCOPE } from "./constants"

type ToolOutput = {
  content: Array<{ type: "text"; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
  _meta?: Record<string, unknown>
}

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const SECURITY_SCHEMES = [{ type: "oauth2", scopes: [MCP_PRIMARY_SCOPE] }] as const
const SECURITY_META = { securitySchemes: SECURITY_SCHEMES }
const DEFAULT_MCP_PUBLIC_ORIGIN = "https://mentes-brillantes-erp.vercel.app"
const TOOL_LIST_COMPAT_INSTALLED = new WeakSet<object>()

const COMPANY_SEARCH_RESULT_SCHEMA = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string().url(),
}).strict()

const COMPANY_SEARCH_OUTPUT_SCHEMA = z.object({
  results: z.array(COMPANY_SEARCH_RESULT_SCHEMA).max(40),
}).strict()

const COMPANY_FETCH_OUTPUT_SCHEMA = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string().url(),
  metadata: z.object({
    category: z.string(),
    source: z.string(),
    readOnly: z.literal(true),
  }).strict(),
}).strict()

function mcpPublicOrigin() {
  const configured = process.env.MCP_PUBLIC_ORIGIN?.trim()
  if (configured) {
    try {
      const parsed = new URL(configured)
      if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.origin
    } catch {
      // Usa el origen de producción si la configuración no es una URL absoluta.
    }
  }
  return DEFAULT_MCP_PUBLIC_ORIGIN
}

function protectedResourceMetadataUrl() {
  return new URL("/.well-known/oauth-protected-resource/api/mcp/mcp", mcpPublicOrigin()).toString()
}

function reader(): SupabaseReader | null {
  return createAdminClient() as unknown as SupabaseReader | null
}

function isToolResult(value: unknown): value is ToolResult {
  return Boolean(value && typeof value === "object" && "status" in value && "provenance" in value && "data" in value)
}

function output(value: unknown, isError = false): ToolOutput {
  const sanitized = sanitizeMcpData(value)
  const structured =
    sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
      ? (sanitized as Record<string, unknown>)
      : { value: sanitized }
  return {
    content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
    ...(isError ? { isError: true } : {}),
  }
}

function authenticationRequiredOutput(): ToolOutput {
  const challenge = [
    "Bearer",
    `resource_metadata="${protectedResourceMetadataUrl()}"`,
    'error="invalid_token"',
    'error_description="OAuth access token required"',
  ].join(" ")
  return {
    ...output({ status: "error", message: "Autenticación OAuth requerida." }, true),
    _meta: {
      "mcp/www_authenticate": [challenge],
    },
  }
}

function failure(message: string): ToolOutput {
  return output({ status: "error", message }, true)
}

export async function executeTool(
  name: string,
  args: unknown,
  extra: any,
  run: () => Promise<unknown>
): Promise<ToolOutput> {
  if (!extra?.authInfo) return authenticationRequiredOutput()

  const startedAt = Date.now()
  let status = "error"
  let resultCount: number | undefined
  let response: ToolOutput
  try {
    const result = await run()
    if (isToolResult(result)) {
      status = result.status
      resultCount = result.resultCount
    } else {
      status = "ok"
    }
    response = output(result, status === "error" || status === "forbidden")
  } catch (error) {
    console.error("[mcp] herramienta falló", {
      tool: name,
      message: error instanceof Error ? error.message : "unknown",
    })
    status = "error"
    // Los errores marcados como `esParaUsuario` explican por que se rechazo la
    // operacion y que hacer (cuenta ambigua, confirmación vencida, rol sin
    // permiso...). Ocultarlos tras el mensaje generico dejaba a la persona sin
    // saber como continuar.
    const paraUsuario = (error as { esParaUsuario?: boolean })?.esParaUsuario === true
    response = failure(
      paraUsuario && error instanceof Error
        ? error.message
        : "No se pudo completar la consulta. No asumas cifras en cero; vuelve a intentarlo."
    )
  }

  // La auditoría es obligatoria (no se entregan datos sin registro), pero un
  // fallo suyo NO debe salir como excepción cruda: se reintenta una vez y, si
  // aun así falla, se responde con un error claro en vez de romper la consulta.
  const auditada = await registrarAuditoria({
    authInfo: extra?.authInfo,
    toolName: name,
    args,
    status,
    durationMs: Date.now() - startedAt,
    resultCount,
  })
  if (!auditada) {
    return failure(
      "No se pudo registrar la auditoría de esta consulta y por seguridad no se entregan datos. Vuelve a intentarlo."
    )
  }
  return response
}

async function registrarAuditoria(params: Parameters<typeof auditMcpToolCall>[0]): Promise<boolean> {
  for (let intento = 1; intento <= 2; intento += 1) {
    try {
      await auditMcpToolCall(params)
      return true
    } catch (error) {
      const code = error instanceof McpAuditError ? error.code : "exception"
      // Falta de contexto autenticado es determinista: reintentar no ayuda.
      if (code === "missing_context") {
        console.error("[mcp] auditoría rechazada por contexto inválido", { tool: params.toolName })
        return false
      }
      if (intento === 2) {
        console.error("[mcp] auditoría fallida tras reintento", { tool: params.toolName, code })
        return false
      }
    }
  }
  return false
}

function register(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  inputSchema: Record<string, z.ZodTypeAny>,
  run: (supabase: SupabaseReader, args: any) => Promise<unknown>,
  outputSchema?: z.ZodTypeAny
) {
  const descriptor = {
    title,
    description,
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
    annotations: READ_ONLY_ANNOTATIONS,
    securitySchemes: SECURITY_SCHEMES,
    _meta: SECURITY_META,
  }
  server.registerTool(
    name,
    descriptor,
    async (args: any, extra: any) =>
      executeTool(name, args, extra, async () => {
        const supabase = reader()
        if (!supabase) throw new Error("Supabase service role no configurado")
        return run(supabase, args)
      })
  )
}

function installToolListSecurityCompatibility(server: McpServer) {
  const lowLevelServer = (server as any)?.server
  if (!lowLevelServer?.setRequestHandler) return
  if (TOOL_LIST_COMPAT_INSTALLED.has(lowLevelServer)) return

  const handlers = lowLevelServer._requestHandlers
  const sdkListHandler = handlers instanceof Map ? handlers.get("tools/list") : null
  if (typeof sdkListHandler !== "function") {
    throw new Error("El SDK MCP no expuso el handler tools/list esperado.")
  }

  lowLevelServer.setRequestHandler(ListToolsRequestSchema, async (request: any, extra: any) => {
    const result = await sdkListHandler(request, extra)
    const tools = Array.isArray(result?.tools)
      ? result.tools.map((tool: any) => {
        const schemes = Array.isArray(tool?._meta?.securitySchemes)
          ? tool._meta.securitySchemes
          : SECURITY_SCHEMES
        return {
          ...tool,
          securitySchemes: schemes,
          _meta: {
            ...(tool?._meta || {}),
            securitySchemes: schemes,
          },
        }
      })
      : []
    return { ...result, tools }
  })
  TOOL_LIST_COMPAT_INSTALLED.add(lowLevelServer)
}

type ResolvedPerson =
  | { kind: "error"; message: string }
  | { kind: "none" }
  | { kind: "ambiguous"; matches: any[] }
  | { kind: "person"; person: any }

async function resolvePerson(supabase: SupabaseReader, person: string): Promise<ResolvedPerson> {
  const result = await searchPerson(supabase, person, 6)
  if (result.status === "error") return { kind: "error", message: "No se pudo buscar la persona." }
  const matches = Array.isArray(result.data) ? (result.data as any[]) : []
  if (!matches.length) return { kind: "none" }
  if (matches.length > 1) return { kind: "ambiguous", matches }
  return { kind: "person", person: matches[0] }
}

function registerPersonTool(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  run: (supabase: SupabaseReader, personId: string, args: any) => Promise<unknown>
) {
  register(
    server,
    name,
    title,
    description,
    {
      persona: z.string().trim().min(1).max(160).describe("Nombre o código de la persona"),
      limite: z.coerce.number().int().positive().max(100).optional(),
    },
    async (supabase, args) => {
      const resolved = await resolvePerson(supabase, String(args.persona || ""))
      if (resolved.kind === "error") throw new Error(resolved.message)
      if (resolved.kind === "none") {
        return {
          status: "empty",
          message: `No encontré a "${String(args.persona || "")}". Usa el nombre completo o el código.`,
        }
      }
      if (resolved.kind === "ambiguous") {
        return {
          status: "ambiguous",
          message: "Hay varias coincidencias; especifica el código para no mezclar datos.",
          coincidencias: resolved.matches.map((match: any) => ({ nombre: match.nombre, codigo: match.codigo })),
        }
      }
      const result = await run(supabase, resolved.person.id, args)
      return {
        persona: { nombre: resolved.person.nombre, codigo: resolved.person.codigo },
        resultado: result,
      }
    }
  )
}

function resolveRange(args: { desde?: string; hasta?: string; rango?: string }) {
  if (args.desde || args.hasta) {
    if (!args.desde || !args.hasta) return { error: "Debes indicar desde y hasta juntos." } as const
    const parsed = resolveNaturalDateRange(`desde ${args.desde} hasta ${args.hasta}`)
    if (!parsed) return { error: "El rango desde/hasta es inválido o está invertido." } as const
    return { range: parsed } as const
  }
  if (args.rango) {
    const parsed = resolveNaturalDateRange(args.rango)
    if (!parsed) return { error: `No pude interpretar el rango "${args.rango}".` } as const
    return { range: parsed } as const
  }
  return { range: resolveNaturalDateRange("este mes")! } as const
}

function registerRangeTool(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  run: (supabase: SupabaseReader, from: string, to: string) => Promise<unknown>
) {
  register(
    server,
    name,
    title,
    description,
    {
      desde: z.string().max(10).optional().describe("Fecha inicial YYYY-MM-DD"),
      hasta: z.string().max(10).optional().describe("Fecha final YYYY-MM-DD"),
      rango: z.string().trim().max(100).optional().describe("Rango natural; por ejemplo, este mes o mayo 2026"),
    },
    async (supabase, args) => {
      const resolved = resolveRange(args)
      if ("error" in resolved) return { status: "error", message: resolved.error }
      const result = await run(supabase, resolved.range.from, resolved.range.to)
      return { rango: resolved.range.label, resultado: result }
    }
  )
}

function nestedName(row: any): string {
  const assistant =
    row?.asistentes ||
    row?.cuentas_por_cobrar?.asistentes ||
    row?.cuentas_por_cobrar?.[0]?.asistentes
  return assistant?.nombre ? String(assistant.nombre) : ""
}

function searchTitle(category: string, row: any): string {
  const person = nestedName(row)
  const main =
    row?.nombre ||
    row?.concepto ||
    row?.comprador_nombre ||
    row?.metodo_pago ||
    row?.tipo ||
    row?.fecha ||
    row?.id
  return [category.replaceAll("_", " "), main, person].filter(Boolean).join(" · ").slice(0, 240)
}

const CATEGORY_ROUTES: Record<string, string> = {
  asistentes: "/asistentes",
  cuentas: "/cuentas",
  pagos_abonos: "/movimientos",
  movimientos_saldo_favor: "/movimientos",
  donaciones_asistentes: "/movimientos",
  egresos: "/egresos",
  ventas_externas: "/ventas-externas",
  coach_sesiones: "/sesiones-coach",
  coach_paquetes: "/sesiones-coach",
  socios: "/socios",
  periodos: "/liquidaciones",
}

function canonicalRecordUrl(category: string, rowId: string) {
  const encodedId = encodeURIComponent(rowId)
  const directPath =
    category === "asistentes"
      ? `/asistentes/${encodedId}`
      : category === "cuentas"
        ? `/cuentas/${encodedId}`
        : null
  const url = new URL(directPath || CATEGORY_ROUTES[category] || "/buscar", mcpPublicOrigin())
  if (!directPath) {
    url.searchParams.set("mcp_category", category)
    url.searchParams.set("mcp_id", rowId)
  }
  return url.toString()
}

async function companySearch(supabase: SupabaseReader, query: string) {
  const result = await searchGlobal(supabase, query)
  const groups = result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>) : {}
  const results: Array<{ id: string; title: string; text: string; url: string }> = []
  for (const [category, value] of Object.entries(groups)) {
    if (!Array.isArray(value)) continue
    for (const row of value) {
      if (!row || typeof row !== "object" || !("id" in row)) continue
      const safeRow = sanitizeMcpData(row)
      results.push({
        id: `${category}:${String((row as any).id)}`,
        title: searchTitle(category, safeRow),
        text: JSON.stringify(safeRow),
        url: canonicalRecordUrl(category, String((row as any).id)),
      })
      if (results.length >= 40) break
    }
    if (results.length >= 40) break
  }
  return { results }
}

const FETCH_SOURCES: Record<string, { table: string; select: string }> = {
  asistentes: { table: "asistentes", select: "id,nombre,codigo,activo" },
  cuentas: {
    table: "cuentas_por_cobrar",
    select: "id,concepto,valor_total,total_abonado,saldo_pendiente,estado,fecha_emision,asistentes(nombre,codigo)",
  },
  pagos_abonos: {
    table: "pagos_abonos",
    select: "id,monto,metodo_pago,fecha_pago,estado,cuentas_por_cobrar(concepto,asistentes(nombre,codigo))",
  },
  movimientos_saldo_favor: {
    table: "movimientos_saldo_favor",
    select: "id,tipo,monto,fecha,metodo_pago,asistentes(nombre,codigo)",
  },
  donaciones_asistentes: {
    table: "donaciones_asistentes",
    select: "id,monto,metodo_pago,fecha,estado,asistentes(nombre,codigo)",
  },
  egresos: { table: "egresos", select: "id,concepto,monto,fecha,estado" },
  ventas_externas: { table: "ventas_externas", select: "id,comprador_nombre,concepto,monto,fecha,estado" },
  coach_sesiones: { table: "coach_sesiones", select: "id,fecha,paquete_id,asistentes(nombre,codigo)" },
  coach_paquetes: {
    table: "coach_paquetes",
    select: "id,sesiones_compradas,creado_en,cuentas_por_cobrar(concepto,asistentes(nombre,codigo))",
  },
  socios: { table: "socios", select: "id,nombre,activo" },
  periodos: { table: "periodos", select: "id,nombre,estado,fecha_inicio,fecha_fin" },
}

async function companyFetch(supabase: SupabaseReader, id: string) {
  const separator = id.indexOf(":")
  if (separator <= 0) throw new Error("Identificador inválido.")
  const category = id.slice(0, separator)
  const rowId = id.slice(separator + 1)
  const source = FETCH_SOURCES[category]
  if (!source || !/^[A-Za-z0-9-]{1,80}$/.test(rowId)) {
    throw new Error("Identificador no permitido.")
  }
  const { data, error } = await supabase.from(source.table).select(source.select).eq("id", rowId).maybeSingle()
  if (error) throw new Error(`No se pudo consultar ${source.table}`)
  if (!data) throw new Error("Registro no encontrado.")
  const safe = sanitizeMcpData(data)
  return {
    id,
    title: searchTitle(category, safe),
    text: JSON.stringify(safe, null, 2),
    url: canonicalRecordUrl(category, rowId),
    metadata: { category, source: source.table, readOnly: true },
  }
}

export function registerErpTools(server: McpServer) {
  registerPersonTool(server, "estado_persona", "Estado financiero de una persona", "Totales facturado, abonado, pendiente y saldo a favor.", (s, id) => getPersonFinancialStatus(s, id))
  registerPersonTool(server, "pagos_persona", "Pagos de una persona", "Pagos o abonos válidos recientes.", (s, id, args) => getPersonPayments(s, id, args.limite || 12))
  registerPersonTool(server, "ultimo_pago_persona", "Último pago de una persona", "Último pago válido registrado.", (s, id) => getPersonLastPayment(s, id))
  registerPersonTool(server, "compras_persona", "Compras de una persona", "Cuentas y conceptos comprados, con abonado y pendiente.", (s, id, args) => getPersonPurchasesOrConcepts(s, id, args.limite || 15))
  registerPersonTool(server, "donaciones_persona", "Donaciones de una persona", "Donaciones válidas registradas.", (s, id) => getPersonDonations(s, id))
  registerPersonTool(server, "sesiones_coach_persona", "Sesiones coach de una persona", "Conteos y fechas de sesiones; nunca devuelve notas privadas.", (s, id) => getCoachSessions(s, id))

  register(
    server,
    "compradores_de_concepto",
    "Compradores de un concepto",
    "Personas que compraron o iniciaron un concepto o producto.",
    {
      concepto: z.string().trim().min(2).max(160),
      limite: z.coerce.number().int().positive().max(500).optional(),
    },
    (s, args) => getConceptBuyers(s, String(args.concepto), args.limite || 500)
  )
  register(
    server,
    "cartera_pendiente",
    "Cartera pendiente",
    "Total por cobrar, personas con deuda y mayores saldos; informa si el resultado está truncado.",
    { limite: z.coerce.number().int().positive().max(500).optional() },
    (s, args) => getOpenReceivablesSummary(s, args.limite || 500)
  )
  register(server, "conteos", "Conteos del ERP", "Asistentes activos/totales y cuentas pendientes.", {}, (s) => getCounts(s))
  register(
    server,
    "cambios_agenda",
    "Cambios pendientes de revisar en la agenda",
    "Compara la agenda de la familia con lo registrado en el ERP y devuelve lo que hay que revisar: sesiones que ya pasaron y no estan registradas, sesiones que movieron de fecha, eventos borrados cuya sesion si esta cobrada, y personas que estan en la agenda pero no en el ERP. Solo informa: no cambia nada.",
    {
      dias_atras: z.coerce.number().int().positive().max(180).optional().describe("Cuantos dias hacia atras revisar (por defecto 45)"),
      dias_adelante: z.coerce.number().int().min(0).max(180).optional().describe("Cuantos dias hacia adelante revisar (por defecto 15)"),
    },
    async (s, args) => {
      const atras = args.dias_atras || 45
      const adelante = args.dias_adelante ?? 15
      const hoy = new Date()
      const fecha = (dias: number) => new Date(hoy.getTime() + dias * 86400000).toISOString().slice(0, 10)
      const desde = fecha(-atras)
      const hasta = fecha(adelante)

      const diferencias = await calcularDiferencias(s as any, { desde, hasta })
      const porTipo = diferencias.reduce((acc: Record<string, number>, d) => {
        acc[d.tipo] = (acc[d.tipo] || 0) + 1
        return acc
      }, {})

      return {
        ventana: { desde, hasta },
        total: diferencias.length,
        por_tipo: porTipo,
        diferencias,
        nota:
          diferencias.length === 0
            ? "La agenda y el ERP coinciden en esta ventana."
            : "Nada de esto se registra solo: hay que aprobarlo una por una.",
      }
    }
  )

  register(
    server,
    "ultimos_movimientos",
    "Últimos movimientos registrados",
    "Historial general: lo ultimo que se registro en TODO el ERP (pagos, egresos, donaciones, ventas externas, cuentas y saldo a favor), de lo mas reciente a lo mas antiguo. Usala para responder \"¿donde voy?\" o \"¿que se registro ultimamente?\".",
    {
      limite: z.coerce.number().int().positive().max(100).optional(),
      tipo: z
        .enum(["abono", "egreso", "donacion", "venta_externa", "cuenta_cobrar", "anticipo", "aplicacion_saldo"])
        .optional()
        .describe("Filtra por un tipo de movimiento"),
    },
    (s, args) => getRecentMovements(s, args.limite || 15, args.tipo || null)
  )
  register(
    server,
    "periodos",
    "Períodos contables",
    "Liquidaciones abiertas o cerradas y sus fechas.",
    { estado: z.enum(["abierto", "cerrado"]).optional() },
    (s, args) => getPeriods(s, args.estado)
  )
  register(
    server,
    "socios_liquidacion",
    "Liquidación de socios",
    "Reparto más reciente por socio: porcentaje, corresponde, adelantos y neto.",
    { socio: z.string().trim().max(160).optional() },
    (s, args) => getPartnerSettlement(s, args.socio || null)
  )
  register(
    server,
    "buscar_global",
    "Buscar en el ERP",
    "Búsqueda general de registros financieros seguros; excluye cédulas y notas privadas.",
    { termino: z.string().trim().min(2).max(160) },
    (s, args) => searchGlobal(s, String(args.termino))
  )

  registerRangeTool(server, "resumen_periodo", "Resumen de un período", "Ingresos operativos, egresos y utilidad estimada.", (s, from, to) => getSummary(s, from, to))
  registerRangeTool(server, "egresos", "Egresos por período", "Egresos activos de un rango.", (s, from, to) => getExpenses(s, from, to))
  registerRangeTool(server, "ventas_externas", "Ventas externas por período", "Ventas externas activas de un rango.", (s, from, to) => getExternalSales(s, from, to))
  registerRangeTool(server, "donaciones_resumen", "Donaciones por período", "Total de donaciones válidas de un rango.", (s, from, to) => getDonationsSummary(s, from, to))
  registerRangeTool(server, "alertas", "Alertas operativas", "Alertas con evidencia y recomendaciones para un rango.", (s, from, to) => getBusinessAlerts(s, from, to))

  register(
    server,
    "search",
    "Buscar conocimiento del ERP",
    "Búsqueda estándar de solo lectura para ChatGPT Company Knowledge y otros clientes MCP.",
    { query: z.string().trim().min(2).max(160) },
    (s, args) => companySearch(s, String(args.query)),
    COMPANY_SEARCH_OUTPUT_SCHEMA
  )
  register(
    server,
    "fetch",
    "Obtener un registro del ERP",
    "Recupera de forma segura un resultado devuelto por search.",
    { id: z.string().trim().min(3).max(200) },
    (s, args) => companyFetch(s, String(args.id)),
    COMPANY_FETCH_OUTPUT_SCHEMA
  )

  installToolListSecurityCompatibility(server)
}
