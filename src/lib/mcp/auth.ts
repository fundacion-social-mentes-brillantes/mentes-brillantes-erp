import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMcpIssuer, getMcpResource, MCP_PRIMARY_SCOPE } from "./constants"
import { isConfigured, verifyAccessToken, type ErpRole, type McpClientKind } from "./oauth"
import { isTokenFamilyRevoked } from "./oauth-store"
import { resolveCurrentMcpIdentity } from "./identity"

export type ErpMcpAuth = {
  email: string
  role: Exclude<ErpRole, "consulta">
  sub: string
  clientName: string
  clientKind: McpClientKind
  sessionId: string
}

function validClientKind(value: unknown): value is McpClientKind {
  return value === "chatgpt" || value === "claude" || value === "claude-code" || value === "other"
}

export async function verifyErpMcpToken(req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer || !isConfigured()) return undefined
  try {
    const issuer = getMcpIssuer(req)
    const resource = getMcpResource(req)
    const payload = await verifyAccessToken(bearer, { audience: resource, issuer })
    const scopes = Array.isArray(payload.scope) ? payload.scope.map(String) : []
    const subject = String(payload.sub || "")
    const familyId = String(payload.sid || "")
    const clientId = String(payload.cid || "")
    const clientName = String(payload.cname || "")
    const clientKind = payload.ckind
    if (
      !subject ||
      !familyId ||
      !clientId ||
      !clientName ||
      !validClientKind(clientKind) ||
      !scopes.includes(MCP_PRIMARY_SCOPE)
    ) {
      return undefined
    }
    if (await isTokenFamilyRevoked(familyId)) return undefined

    const admin = createAdminClient()
    if (!admin) return undefined
    const identity = await resolveCurrentMcpIdentity(admin, subject)
    if (!identity) return undefined
    return {
      token: bearer,
      clientId,
      scopes,
      expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
      resource: new URL(resource),
      extra: {
        email: identity.email,
        role: identity.role,
        sub: identity.userId,
        clientName,
        clientKind,
        sessionId: familyId,
      } satisfies ErpMcpAuth,
    }
  } catch (error) {
    console.error("[mcp] token inválido", {
      message: error instanceof Error ? error.message : "unknown",
    })
    return undefined
  }
}
