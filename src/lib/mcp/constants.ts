import { getPublicOrigin } from "mcp-handler"

export const MCP_RESOURCE_PATH = "/api/mcp/mcp"
export const MCP_PRIMARY_SCOPE = "erp.read"
export const MCP_OPTIONAL_SCOPE = "offline_access"
export const MCP_SUPPORTED_SCOPES = [MCP_PRIMARY_SCOPE, MCP_OPTIONAL_SCOPE] as const

export function getMcpIssuer(req: Request): string {
  return getPublicOrigin(req).replace(/\/+$/, "")
}

export function getMcpResource(req: Request): string {
  return `${getMcpIssuer(req)}${MCP_RESOURCE_PATH}`
}

export function normalizeRequestedScopes(value: string | null | undefined): string[] | null {
  const requested = String(value || MCP_PRIMARY_SCOPE)
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean)

  const unique = Array.from(new Set(requested))
  if (!unique.includes(MCP_PRIMARY_SCOPE)) return null
  if (unique.some((scope) => !MCP_SUPPORTED_SCOPES.includes(scope as (typeof MCP_SUPPORTED_SCOPES)[number]))) {
    return null
  }
  return unique
}

export function oauthNoStoreHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    ...extra,
  }
}
