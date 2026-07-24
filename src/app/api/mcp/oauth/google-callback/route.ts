import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  OAUTH_CTX_COOKIE,
  issueAuthCode,
  readClientId,
  readOAuthContext,
  redirectUriAllowed,
} from "@/lib/mcp/oauth"
import { resolveMcpIdentity } from "@/lib/mcp/identity"
import { getMcpIssuer, getMcpResource, normalizeRequestedScopes, oauthNoStoreHeaders } from "@/lib/mcp/constants"

export const dynamic = "force-dynamic"

const ERROR_HEADERS = oauthNoStoreHeaders({
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
})

function errorPage(message: string, status = 400) {
  const html = `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0a1016;color:#f1f6f0;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px"><div><h1 style="font-size:1.1rem">No se pudo conectar</h1><p style="color:#a3b0a6">${message}</p></div></body>`
  return new Response(html, { status, headers: ERROR_HEADERS })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const providerCode = url.searchParams.get("code")
  if (!providerCode) return errorPage("Falta el código de Google.")

  const jar = await cookies()
  const contextToken = jar.get(OAUTH_CTX_COOKIE)?.value
  if (!contextToken) return errorPage("La autorización expiró. Vuelve a intentarlo desde Claude o ChatGPT.")

  let context
  try {
    context = await readOAuthContext(contextToken)
  } catch {
    return errorPage("Contexto de autorización inválido.")
  }

  const client = await readClientId(context.clientId)
  const currentIssuer = getMcpIssuer(req)
  const currentResource = getMcpResource(req)
  const scopes = normalizeRequestedScopes(context.scopes.join(" "))
  if (
    !client ||
    !redirectUriAllowed(context.redirectUri, client.redirect_uris) ||
    context.issuer !== currentIssuer ||
    context.resource !== currentResource ||
    !scopes
  ) {
    return errorPage("La solicitud de autorización ya no es válida.")
  }

  const supabase = await createClient()
  if (!supabase) return errorPage("Servidor no configurado.", 500)
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(providerCode)
  if (exchangeError) return errorPage("No se pudo validar el inicio con Google.")

  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return errorPage("No se pudo obtener el usuario de Google.")

  const admin = createAdminClient()
  if (!admin) return errorPage("Servidor no configurado.", 500)
  const identity = await resolveMcpIdentity(admin, user)
  if (!identity) return errorPage("Tu cuenta no tiene permiso para el MCP financiero (requiere rol admin o caja).", 403)

  try {
    const mcpCode = await issueAuthCode({
      sub: identity.userId,
      email: identity.email,
      role: identity.role,
      clientId: context.clientId,
      clientName: client.name,
      clientKind: client.kind,
      redirectUri: context.redirectUri,
      codeChallenge: context.codeChallenge,
      resource: currentResource,
      scopes,
      issuer: currentIssuer,
    })
    const redirect = new URL(context.redirectUri)
    redirect.searchParams.set("code", mcpCode)
    if (context.state) redirect.searchParams.set("state", context.state)

    const response = NextResponse.redirect(redirect.toString(), 302)
    response.headers.set("Cache-Control", "no-store")
    response.headers.set("Pragma", "no-cache")
    response.cookies.delete(OAUTH_CTX_COOKIE)
    return response
  } catch (error) {
    console.error("[mcp] no se pudo completar OAuth con Google", {
      message: error instanceof Error ? error.message : "unknown",
    })
    return errorPage("No se pudo completar la autorización. Inténtalo de nuevo.", 500)
  }
}
