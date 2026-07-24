import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { OAUTH_CTX_COOKIE, issueOAuthContext } from "@/lib/mcp/oauth"
import { readOauthParams, validateAuthorizationRequest } from "@/lib/mcp/authorize-request"
import { oauthNoStoreHeaders } from "@/lib/mcp/constants"
import { isMcpGoogleAuthEnabled } from "@/lib/mcp/google-auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  if (!isMcpGoogleAuthEnabled()) {
    return new Response("Inicio con Google no disponible.", {
      status: 404,
      headers: oauthNoStoreHeaders(),
    })
  }

  const url = new URL(req.url)
  const params = readOauthParams((key) => url.searchParams.get(key))
  const validation = await validateAuthorizationRequest(req, params)
  if (!validation.ok) {
    return new Response("Solicitud de autorización inválida.", { status: 400, headers: oauthNoStoreHeaders() })
  }

  const supabase = await createClient()
  if (!supabase) return new Response("Servidor no configurado.", { status: 500, headers: oauthNoStoreHeaders() })

  const { issuer, resource, scopes, client } = validation.value
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${issuer}/api/mcp/oauth/google-callback` },
  })
  if (error || !data?.url) {
    return new Response("No se pudo iniciar sesión con Google. Usa tu correo y contraseña.", {
      status: 502,
      headers: oauthNoStoreHeaders(),
    })
  }

  const context = await issueOAuthContext({
    clientId: params.client_id,
    clientName: client.name,
    clientKind: client.kind,
    redirectUri: params.redirect_uri,
    codeChallenge: params.code_challenge,
    state: params.state,
    resource,
    scopes,
    issuer,
  })
  const response = NextResponse.redirect(data.url, 302)
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Pragma", "no-cache")
  response.cookies.set(OAUTH_CTX_COOKIE, context, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/mcp/oauth",
    maxAge: 600,
  })
  return response
}
