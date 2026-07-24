import { createAdminClient } from "@/lib/supabase/admin"
import {
  consumeRefreshToken,
  hashOAuthValue,
  issueTokens,
  readAuthCode,
  readClientId,
  redeemAuthorizationCodeOnce,
  redirectUriAllowed,
  revokeTokenFamily,
  verifyPkceS256,
} from "@/lib/mcp/oauth"
import { getMcpIssuer, getMcpResource, normalizeRequestedScopes, oauthNoStoreHeaders } from "@/lib/mcp/constants"
import { resolveCurrentMcpIdentity } from "@/lib/mcp/identity"

export const dynamic = "force-dynamic"

const CORS = oauthNoStoreHeaders({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "X-Content-Type-Options": "nosniff",
})

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

function oauthError(code: string, description: string, status = 400) {
  return Response.json({ error: code, error_description: description }, { status, headers: CORS })
}

async function readBody(req: Request): Promise<Record<string, string> | null> {
  const declaredLength = Number(req.headers.get("content-length") || "0")
  if (declaredLength > 16_384) return null
  const raw = await req.text()
  if (raw.length > 16_384) return null
  const contentType = req.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    try {
      const json = JSON.parse(raw || "{}") as Record<string, unknown>
      return Object.fromEntries(Object.entries(json).map(([key, value]) => [key, String(value)]))
    } catch {
      return {}
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded") || !contentType) {
    return Object.fromEntries(new URLSearchParams(raw))
  }
  return {}
}

async function currentIdentity(userId: string) {
  const admin = createAdminClient()
  if (!admin) return null
  return resolveCurrentMcpIdentity(admin, userId)
}

function tokenResponse(tokens: Awaited<ReturnType<typeof issueTokens>>, scopes: string[]) {
  const { family_id: _familyId, ...publicTokens } = tokens
  return Response.json(
    { token_type: "Bearer", scope: scopes.join(" "), ...publicTokens },
    { headers: CORS }
  )
}

export async function POST(req: Request) {
  const body = await readBody(req)
  if (!body) return oauthError("invalid_request", "Solicitud demasiado grande.", 413)
  const grantType = body.grant_type
  const issuer = getMcpIssuer(req)
  const resource = getMcpResource(req)

  try {
    if (grantType === "authorization_code") {
      const { code, code_verifier: verifier, redirect_uri: redirectUri, client_id: clientId } = body
      if (!code || !verifier || !redirectUri || !clientId || !body.resource) {
        return oauthError("invalid_request", "Faltan code, code_verifier, client_id, redirect_uri o resource.")
      }
      if (body.resource !== resource) return oauthError("invalid_target", "resource no coincide con el endpoint MCP.")

      const client = await readClientId(clientId)
      if (!client || !redirectUriAllowed(redirectUri, client.redirect_uris)) {
        return oauthError("invalid_client", "Cliente o redirect_uri inválido.", 401)
      }
      const claims = await readAuthCode(code, { issuer, resource }).catch(() => null)
      if (!claims) return oauthError("invalid_grant", "Código inválido o expirado.")
      const scopes = normalizeRequestedScopes(String(claims.scope || ""))
      if (
        claims.cid !== clientId ||
        claims.redirect_uri !== redirectUri ||
        claims.resource !== resource ||
        claims.cname !== client.name ||
        !scopes ||
        !verifyPkceS256(verifier, String(claims.cc || ""))
      ) {
        return oauthError("invalid_grant", "El código no coincide con esta solicitud.")
      }
      if (!(await redeemAuthorizationCodeOnce(code))) {
        return oauthError("invalid_grant", "El código ya fue usado, venció o fue revocado.")
      }

      const identity = await currentIdentity(String(claims.sub || ""))
      if (!identity) return oauthError("invalid_grant", "La cuenta ya no tiene permiso para el MCP financiero.")
      const tokens = await issueTokens({
        sub: identity.userId,
        email: identity.email,
        role: identity.role,
        clientId,
        clientName: client.name,
        clientKind: client.kind,
        resource,
        issuer,
        scopes,
      })
      return tokenResponse(tokens, scopes)
    }

    if (grantType === "refresh_token") {
      const refreshToken = body.refresh_token
      const clientId = body.client_id
      if (!refreshToken || !clientId) return oauthError("invalid_request", "Faltan refresh_token o client_id.")
      if (body.resource && body.resource !== resource) {
        return oauthError("invalid_target", "resource no coincide con el endpoint MCP.")
      }

      const grant = await consumeRefreshToken(refreshToken)
      if (!grant) return oauthError("invalid_grant", "refresh_token inválido, usado, vencido o revocado.")
      if (grant.client_id_hash !== hashOAuthValue(clientId) || grant.resource !== resource) {
        await revokeTokenFamily(grant.family_id)
        return oauthError("invalid_grant", "El refresh_token no pertenece a este cliente o recurso.")
      }
      const client = await readClientId(clientId)
      if (!client || client.name !== grant.client_name) {
        await revokeTokenFamily(grant.family_id)
        return oauthError("invalid_client", "Cliente inválido o vencido.", 401)
      }
      const scopes = normalizeRequestedScopes(grant.scope)
      if (!scopes) {
        await revokeTokenFamily(grant.family_id)
        return oauthError("invalid_grant", "Los permisos del refresh_token no son válidos.")
      }
      const identity = await currentIdentity(grant.user_id)
      if (!identity) {
        await revokeTokenFamily(grant.family_id)
        return oauthError("invalid_grant", "La cuenta ya no tiene permiso para el MCP financiero.")
      }

      const tokens = await issueTokens({
        sub: identity.userId,
        email: identity.email,
        role: identity.role,
        clientId,
        clientName: client.name,
        clientKind: client.kind,
        resource,
        issuer,
        scopes,
        familyId: grant.family_id,
      })
      return tokenResponse(tokens, scopes)
    }

    return oauthError("unsupported_grant_type", "grant_type no soportado.")
  } catch (error) {
    console.error("[mcp] token endpoint error", {
      message: error instanceof Error ? error.message : "unknown",
    })
    return oauthError("server_error", "Error interno.", 500)
  }
}
