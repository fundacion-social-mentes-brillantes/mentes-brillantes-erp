import { getPublicOrigin } from "mcp-handler"
import { createAdminClient } from "@/lib/supabase/admin"
import { issueTokens, readAuthCode, verifyPkceS256, verifyRefreshToken, type ErpRole } from "@/lib/mcp/oauth"

// Token endpoint (OAuth 2.1). Canjea el código de autorización (validando PKCE)
// o un refresh_token por un access_token.
export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

function err(code: string, description: string, status = 400) {
  return Response.json({ error: code, error_description: description }, { status, headers: CORS })
}

async function readBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => ({}))
    return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, String(v)]))
  }
  const form = await req.formData().catch(() => null)
  if (!form) return {}
  const out: Record<string, string> = {}
  form.forEach((value, key) => {
    out[key] = String(value)
  })
  return out
}

export async function POST(req: Request) {
  const origin = getPublicOrigin(req)
  const body = await readBody(req)
  const grantType = body.grant_type

  try {
    if (grantType === "authorization_code") {
      const code = body.code
      const codeVerifier = body.code_verifier
      const redirectUri = body.redirect_uri
      const clientId = body.client_id
      if (!code || !codeVerifier) return err("invalid_request", "Faltan code o code_verifier.")

      const payload = await readAuthCode(code).catch(() => null)
      if (!payload) return err("invalid_grant", "Código inválido o expirado.")
      if (clientId && payload.cid && clientId !== payload.cid) return err("invalid_grant", "client_id no coincide.")
      if (redirectUri && payload.redirect_uri && redirectUri !== payload.redirect_uri) return err("invalid_grant", "redirect_uri no coincide.")
      if (!verifyPkceS256(codeVerifier, String(payload.cc || ""))) return err("invalid_grant", "PKCE inválido.")

      const tokens = await issueTokens({
        sub: String(payload.sub),
        email: String(payload.email || ""),
        role: (payload.role as ErpRole) || "consulta",
        audience: origin,
        issuer: origin,
      })
      return Response.json({ token_type: "Bearer", scope: "erp.read", ...tokens }, { headers: CORS })
    }

    if (grantType === "refresh_token") {
      const refresh = body.refresh_token
      if (!refresh) return err("invalid_request", "Falta refresh_token.")
      const payload = await verifyRefreshToken(refresh, { issuer: origin }).catch(() => null)
      if (!payload) return err("invalid_grant", "refresh_token inválido o expirado.")

      // Re-verifica el rol en la BD en cada refresco: si la cuenta fue dada de
      // baja o cambió a un rol sin acceso, el refresh deja de funcionar (revocación).
      const admin = createAdminClient()
      if (!admin) return err("server_error", "Servidor no configurado.", 500)
      const { data: perfil } = await admin.from("perfiles").select("rol").eq("id", String(payload.sub)).maybeSingle()
      const role = perfil?.rol as ErpRole | undefined
      if (role !== "admin" && role !== "caja") {
        return err("invalid_grant", "La cuenta ya no tiene permiso para el MCP financiero.")
      }

      const tokens = await issueTokens({
        sub: String(payload.sub),
        email: String(payload.email || ""),
        role,
        audience: origin,
        issuer: origin,
      })
      return Response.json({ token_type: "Bearer", scope: "erp.read", ...tokens }, { headers: CORS })
    }

    return err("unsupported_grant_type", "grant_type no soportado.")
  } catch (error: any) {
    console.error("[mcp] token endpoint error", { message: error?.message })
    return err("server_error", "Error interno.", 500)
  }
}
