import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { createHash } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import type { ErpMcpAuth } from "./auth"

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export function hashAuditArguments(args: unknown): string {
  return createHash("sha256").update(stable(args)).digest("hex")
}

export type McpAuditErrorCode = "missing_context" | "client_unavailable" | "insert_failed"

export class McpAuditError extends Error {
  readonly code: McpAuditErrorCode

  constructor(code: McpAuditErrorCode, message: string) {
    super(message)
    this.name = "McpAuditError"
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

function requiredAuditContext(authInfo?: AuthInfo): {
  clientId: string
  identity: ErpMcpAuth
} {
  const clientId = String(authInfo?.clientId || "").trim()
  const identity = authInfo?.extra as Partial<ErpMcpAuth> | undefined
  const validClientKind =
    identity?.clientKind === "chatgpt" ||
    identity?.clientKind === "claude" ||
    identity?.clientKind === "claude-code" ||
    identity?.clientKind === "other"
  if (
    !clientId ||
    !identity ||
    !identity.sub ||
    !identity.sessionId ||
    !identity.clientName ||
    (identity.role !== "admin" && identity.role !== "caja") ||
    !validClientKind
  ) {
    throw new McpAuditError("missing_context", "Falta el contexto autenticado requerido para auditar la consulta MCP.")
  }
  return { clientId, identity: identity as ErpMcpAuth }
}

export async function auditMcpToolCall(params: {
  authInfo?: AuthInfo
  toolName: string
  args: unknown
  status: string
  durationMs: number
  resultCount?: number
}): Promise<void> {
  const { clientId, identity } = requiredAuditContext(params.authInfo)
  const client = createAdminClient()
  if (!client) {
    throw new McpAuditError("client_unavailable", "El almacenamiento de auditoría MCP no está disponible.")
  }

  try {
    const { error } = await client.from("mcp_access_audit").insert({
      user_id: identity.sub,
      client_id_hash: clientId,
      client_name: identity.clientName,
      client_kind: identity.clientKind,
      tool_name: params.toolName,
      args_hash: hashAuditArguments(params.args),
      status: params.status.slice(0, 32),
      duration_ms: Math.max(0, Math.round(params.durationMs)),
      result_count: Number.isFinite(params.resultCount) ? params.resultCount : null,
    })
    if (!error) return

    console.error("[mcp] no se pudo registrar auditoría", {
      tool: params.toolName,
      code: error.code,
    })
  } catch (error) {
    if (error instanceof McpAuditError) throw error
    console.error("[mcp] no se pudo registrar auditoría", {
      tool: params.toolName,
      code: "exception",
    })
  }

  throw new McpAuditError("insert_failed", "No se pudo registrar la auditoría MCP.")
}
