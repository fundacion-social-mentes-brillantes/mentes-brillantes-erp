import { NextResponse } from "next/server"
import { getPublicOrigin } from "mcp-handler"
import { createClient } from "@/lib/supabase/server"
import { OAUTH_CTX_COOKIE, issueOAuthContext, readClientId, redirectUriAllowed } from "@/lib/mcp/oauth"

// Inicia el login con Google para el MCP: guarda el contexto OAuth (cookie
// firmada) y redirige al Google de Supabase. Al volver, google-callback retoma.
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const g = (k: string) => url.searchParams.get(k) || ""
  const clientId = g("client_id")
  const redirectUri = g("redirect_uri")
  const codeChallenge = g("code_challenge")
  const method = g("code_challenge_method")
  const state = g("state")

  const client = await readClientId(clientId)
  if (!client || !redirectUriAllowed(redirectUri, client.redirect_uris) || !codeChallenge || method !== "S256") {
    return new Response("Solicitud de autorización inválida.", { status: 400 })
  }

  const supabase = await createClient()
  if (!supabase) return new Response("Servidor no configurado.", { status: 500 })

  const origin = getPublicOrigin(req)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/api/mcp/oauth/google-callback` },
  })
  if (error || !data?.url) {
    return new Response("No se pudo iniciar sesión con Google. Usa tu correo y contraseña.", { status: 502 })
  }

  const ctx = await issueOAuthContext({ clientId, redirectUri, codeChallenge, state })
  const res = NextResponse.redirect(data.url, 302)
  res.cookies.set(OAUTH_CTX_COOKIE, ctx, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/mcp/oauth",
    maxAge: 600,
  })
  return res
}
