import type { Alert, ToolResult } from "./types"
import { toolResult } from "./types"

export function getAlerts(results: ToolResult[]) {
  const alerts: Alert[] = results.flatMap((result) => result.alerts || [])
  const partials = results
    .filter((result) => result.status === "partial" || result.status === "error")
    .map((result) => ({
      severity: "medium" as const,
      type: "datos_incompletos",
      evidence: [`${result.toolName}: ${result.status}`],
      rule: "Las consultas fallidas no se convierten en cero.",
      impact: "La respuesta puede estar incompleta.",
      recommendation: "Conviene revisar el ERP si la cifra es sensible.",
    }))

  const all = [...alerts, ...partials].slice(0, 5)
  return toolResult({
    toolName: "getAlerts",
    status: all.length ? "ok" : "empty",
    queryScope: { resultCount: results.length },
    sources: results.flatMap((result) => result.provenance.sources),
    resultCount: all.length,
    data: all,
    alerts: all,
  })
}
