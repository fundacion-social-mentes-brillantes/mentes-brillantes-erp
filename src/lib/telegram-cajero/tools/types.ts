export type ToolStatus = "ok" | "empty" | "partial" | "ambiguous" | "forbidden" | "error"
export type RiskLevel = "low" | "medium" | "high"

export type Alert = {
  severity: "critical" | "high" | "medium" | "low"
  type: string
  entity?: Record<string, unknown>
  evidence: string[]
  rule: string
  impact: string
  recommendation: string
}

export type ToolResult<T = unknown> = {
  toolName: string
  status: ToolStatus
  queryScope: Record<string, unknown>
  provenance: {
    sources: string[]
    asOf: string
  }
  resultCount: number
  data: T
  alerts: Alert[]
  explanationHints: string[]
  userSafeErrors: string[]
  riskLevel: RiskLevel
  requiresConfirmation: boolean
}

export type SupabaseReader = {
  from(table: string): any
}

export function toolResult<T>({
  toolName,
  status,
  queryScope,
  sources,
  resultCount,
  data,
  alerts = [],
  explanationHints = [],
  userSafeErrors = [],
  riskLevel = "low",
  requiresConfirmation = false,
}: {
  toolName: string
  status: ToolStatus
  queryScope: Record<string, unknown>
  sources: string[]
  resultCount: number
  data: T
  alerts?: Alert[]
  explanationHints?: string[]
  userSafeErrors?: string[]
  riskLevel?: RiskLevel
  requiresConfirmation?: boolean
}): ToolResult<T> {
  return {
    toolName,
    status,
    queryScope,
    provenance: { sources, asOf: new Date().toISOString() },
    resultCount,
    data,
    alerts,
    explanationHints,
    userSafeErrors,
    riskLevel,
    requiresConfirmation,
  }
}

export function toolError(toolName: string, queryScope: Record<string, unknown>, source: string, error: any) {
  console.error(`[telegram-cajero] ${toolName} fallo`, {
    code: error?.code,
    message: error?.message,
  })
  return toolResult({
    toolName,
    status: "error",
    queryScope,
    sources: [source],
    resultCount: 0,
    data: null,
    userSafeErrors: ["No se pudo consultar esta informacion. No uses cifras en cero para esta seccion."],
    riskLevel: "medium",
  })
}
