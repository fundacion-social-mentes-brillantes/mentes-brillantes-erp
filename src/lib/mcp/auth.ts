import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { getPublicOrigin } from "mcp-handler"
import { verifyAccessToken, isConfigured, type ErpRole } from "./oauth"

// El MCP valida SUS PROPIOS tokens (emitidos por el login del ERP, ver oauth.ts).
// No hay proveedores externos ni variables nuevas: la clave se deriva del
// SUPABASE_SERVICE_ROLE_KEY que ya existe en Vercel.

export type ErpMcpAuth = { email: string; role: ErpRole; sub: string }

export async function verifyErpMcpToken(req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined
  if (!isConfigured()) {
    console.error("[mcp] falta SUPABASE_SERVICE_ROLE_KEY; no se puede validar el token")
    return undefined
  }
  try {
    const origin = getPublicOrigin(req)
    const payload = await verifyAccessToken(bearer, { audience: origin, issuer: origin })
    return {
      token: bearer,
      clientId: "mcp-erp",
      scopes: ["erp.read"],
      expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
      extra: {
        email: String(payload.email || ""),
        role: (payload.role as ErpRole) || "consulta",
        sub: String(payload.sub || ""),
      } as ErpMcpAuth,
    }
  } catch (error: any) {
    console.error("[mcp] token invalido", { message: error?.message })
    return undefined
  }
}
