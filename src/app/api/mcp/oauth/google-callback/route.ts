import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { OAUTH_CTX_COOKIE, issueAuthCode, readOAuthContext, type ErpRole } from "@/lib/mcp/oauth"

// Vuelta del login con Google: intercambia el código de Supabase por sesión,
// verifica el rol (admin/caja) y emite el código OAuth del MCP para Claude.
export const dynamic = "force-dynamic"

function errorPage(message: string, status = 400) {
  const html = `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0a1016;color:#f1f6f0;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px"><div><h1 style="font-size:1.1rem">No se pudo conectar</h1><p style="color:#a3b0a6">${message}</p></div></body>`
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } })
}

async function resolveRole(admin: any, userId: string, email: string): Promise<ErpRole | null> {
  const byId = await admin.from("perfiles").select("rol").eq("id", userId).maybeSingle()
  if (byId.data?.rol) return byId.data.rol as ErpRole
  // Por si Google creó una identidad distinta a la de correo/contraseña.
  const list = await admin.auth.admin.listUsers().catch(() => null)
  const match = list?.data?.users?.find((u: any) => String(u.email || "").toLowerCase() === email.toLowerCase())
  if (match) {
    const byEmail = await admin.from("perfiles").select("rol").eq("id", match.id).maybeSingle()
    return (byEmail.data?.rol as ErpRole) || null
  }
  return null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  if (!code) return errorPage("Falta el código de Google.")

  const jar = await cookies()
  const ctxToken = jar.get(OAUTH_CTX_COOKIE)?.value
  if (!ctxToken) return errorPage("La sesión de autorización expiró. Vuelve a intentar desde Claude.")

  let ctx
  try {
    ctx = await readOAuthContext(ctxToken)
  } catch {
    return errorPage("Contexto de autorización inválido.")
  }

  const supabase = await createClient()
  if (!supabase) return errorPage("Servidor no configurado.", 500)

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) return errorPage("No se pudo validar el inicio con Google.")

  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return errorPage("No se pudo obtener el usuario de Google.")

  const admin = createAdminClient()
  if (!admin) return errorPage("Servidor no configurado.", 500)

  const email = user.email || ""
  const role = await resolveRole(admin, user.id, email)
  if (role !== "admin" && role !== "caja") {
    return errorPage("Tu cuenta de Google no tiene permiso para el MCP financiero (requiere admin o caja).", 403)
  }

  const mcpCode = await issueAuthCode({
    sub: user.id,
    email,
    role,
    clientId: ctx.clientId,
    redirectUri: ctx.redirectUri,
    codeChallenge: ctx.codeChallenge,
  })

  const redirect = new URL(ctx.redirectUri)
  redirect.searchParams.set("code", mcpCode)
  if (ctx.state) redirect.searchParams.set("state", ctx.state)

  const res = NextResponse.redirect(redirect.toString(), 302)
  res.cookies.delete(OAUTH_CTX_COOKIE)
  return res
}
