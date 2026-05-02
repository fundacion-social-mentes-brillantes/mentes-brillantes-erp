import type { ToolResult } from "./types"

export function explainPreviousResult(result: ToolResult) {
  return [
    `Tool: ${result.toolName}`,
    `Estado: ${result.status}`,
    `Fuentes: ${result.provenance.sources.join(", ") || "sin fuentes"}`,
    result.userSafeErrors.length ? `Parcialidad: ${result.userSafeErrors.join(" ")}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}
