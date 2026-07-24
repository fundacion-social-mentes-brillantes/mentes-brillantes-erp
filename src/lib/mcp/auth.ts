import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"

// ============================================================================
// Autenticación OAuth del MCP financiero.
//
// El MCP es un RESOURCE SERVER: NO guarda contraseñas ni sesiones. Confía en un
// proveedor de identidad externo (Microsoft Entra ID o Google) que actúa como
// Authorization Server. Claude hace el flujo OAuth con ese proveedor y nos
// presenta un token (JWT). Aquí lo validamos criptográficamente (JWKS) y,
// además, exigimos que el correo esté en una LISTA BLANCA (los 4 usuarios).
//
// Config por variables de entorno (en Vercel, NUNCA en el repo):
//  - MCP_OAUTH_ISSUER   ej Entra: https://login.microsoftonline.com/<TENANT>/v2.0
//                       ej Google: https://accounts.google.com
//  - MCP_OAUTH_AUDIENCE  el client_id (o Application ID URI) de la app registrada
//  - MCP_ALLOWED_EMAILS  correos permitidos, separados por coma. Opcional rol:
//                        "ana@x.com:admin, juan@x.com:caja"
// ============================================================================

export type ErpRole = "admin" | "caja" | "consulta"
export type ErpMcpAuth = { email: string; role: ErpRole; sub: string }

type AllowedUser = { email: string; role: ErpRole }

let jwksCache: { uri: string; set: ReturnType<typeof createRemoteJWKSet>; issuer: string } | null = null

export function mcpOAuthConfig() {
  const issuer = process.env.MCP_OAUTH_ISSUER?.replace(/\/+$/, "")
  const audience = process.env.MCP_OAUTH_AUDIENCE
  return { issuer, audience, configured: Boolean(issuer && audience && parseAllowlist().length) }
}

function parseAllowlist(): AllowedUser[] {
  const raw = process.env.MCP_ALLOWED_EMAILS || ""
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [email, role] = entry.split(":").map((part) => part.trim())
      const normalizedRole = role === "caja" || role === "consulta" ? role : "admin"
      return { email: email.toLowerCase(), role: normalizedRole as ErpRole }
    })
    .filter((user) => user.email.includes("@"))
}

async function getJwks(issuer: string) {
  const discoveryUrl = `${issuer}/.well-known/openid-configuration`
  const discovery = await fetch(discoveryUrl).then((response) => {
    if (!response.ok) throw new Error(`OIDC discovery ${response.status}`)
    return response.json()
  })
  const jwksUri: string = discovery.jwks_uri
  const effectiveIssuer: string = discovery.issuer || issuer
  if (!jwksCache || jwksCache.uri !== jwksUri) {
    jwksCache = { uri: jwksUri, set: createRemoteJWKSet(new URL(jwksUri)), issuer: effectiveIssuer }
  }
  return jwksCache
}

function emailFromClaims(payload: JWTPayload): string {
  const raw =
    (payload.email as string) ||
    (payload.preferred_username as string) ||
    (payload.upn as string) ||
    ""
  return String(raw).toLowerCase()
}

/**
 * Verifica el bearer token del MCP. Devuelve AuthInfo si es válido y el correo
 * está autorizado; undefined en cualquier otro caso (→ 401).
 */
export async function verifyErpMcpToken(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined

  const { issuer, audience } = mcpOAuthConfig()
  if (!issuer || !audience) {
    console.error("[mcp] OAuth no configurado (faltan MCP_OAUTH_ISSUER / MCP_OAUTH_AUDIENCE)")
    return undefined
  }

  const allowlist = parseAllowlist()
  if (!allowlist.length) {
    console.error("[mcp] sin MCP_ALLOWED_EMAILS; se rechaza por seguridad")
    return undefined
  }

  try {
    const jwks = await getJwks(issuer)
    const { payload } = await jwtVerify(bearer, jwks.set, {
      issuer: jwks.issuer,
      audience,
      clockTolerance: 30,
    })

    const email = emailFromClaims(payload)
    const match = allowlist.find((user) => user.email === email)
    if (!match) {
      console.error("[mcp] correo no autorizado", { email })
      return undefined
    }

    return {
      token: bearer,
      clientId: String(payload.azp || payload.appid || audience),
      scopes: ["erp.read"],
      expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
      extra: { email: match.email, role: match.role, sub: String(payload.sub || "") } as ErpMcpAuth,
    }
  } catch (error: any) {
    console.error("[mcp] token invalido", { message: error?.message })
    return undefined
  }
}
