import { createClient as createPasswordClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { issueAuthCode, issueOAuthContext, readOAuthContext } from "@/lib/mcp/oauth"
import {
  readOauthParams,
  validateAuthorizationRequest,
  type OauthParams,
  type ValidAuthorizationRequest,
} from "@/lib/mcp/authorize-request"
import { resolveMcpIdentity } from "@/lib/mcp/identity"
import { oauthNoStoreHeaders } from "@/lib/mcp/constants"
import { isMcpGoogleAuthEnabled } from "@/lib/mcp/google-auth"

export const dynamic = "force-dynamic"

function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] as string
  )
}

const PAGE_HEADERS = oauthNoStoreHeaders({
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
})

function page(bodyInner: string, status = 200): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Autorizar MCP — Mentes Brillantes</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:radial-gradient(circle at 76% 20%,rgba(211,182,87,.18),transparent 60%),linear-gradient(135deg,#0f1c25,#060c11);color:#f1f6f0;padding:24px}
.card{width:100%;max-width:440px;background:rgba(13,21,27,.96);border:1px solid rgba(221,178,87,.3);border-radius:20px;padding:28px;box-shadow:0 24px 70px rgba(0,0,0,.5)}
h1{font-size:1.2rem;margin:0 0 6px}p.sub{color:#a3b0a6;font-size:.88rem;margin:0 0 18px;line-height:1.5}.brand{font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:#dbb257;font-weight:700}
.scope{background:#0a1016;border:1px solid rgba(120,140,150,.35);padding:12px;border-radius:12px;font-size:.82rem;margin:14px 0}.scope strong{display:block;margin-bottom:5px}.scope code{color:#99dfc6;word-break:break-all}
label{display:block;font-size:.8rem;color:#a3b0a6;margin:14px 0 6px}input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(120,140,150,.4);background:#0a1016;color:#f1f6f0;font-size:16px}
button{width:100%;margin-top:20px;padding:13px;border:0;border-radius:12px;font-weight:700;font-size:.96rem;cursor:pointer;background:linear-gradient(135deg,#32d396,#1cb280);color:#031a12}
.session-btn{background:linear-gradient(135deg,#dbb257,#b78b2f);color:#171006}.err{background:rgba(251,113,133,.15);border:1px solid rgba(251,113,133,.4);color:#fda4af;padding:10px 12px;border-radius:10px;font-size:.85rem;margin-bottom:10px}.gbtn{display:block;text-align:center;width:100%;padding:12px;border-radius:12px;border:1px solid rgba(120,140,150,.5);background:#0a1016;color:#f1f6f0;font-weight:600;text-decoration:none;margin-top:8px}.cancel{display:block;text-align:center;color:#a3b0a6;font-size:.85rem;margin-top:15px}.divider{display:flex;align-items:center;gap:10px;color:#7d8c92;font-size:.8rem;margin:16px 0}.divider span{height:1px;flex:1;background:rgba(120,140,150,.35)}
</style></head><body><main class="card">${bodyInner}</main></body></html>`
  return new Response(html, { status, headers: PAGE_HEADERS })
}

async function loginForm(valid: ValidAuthorizationRequest, error?: string): Promise<Response> {
  const { params, client, scopes, resource } = valid
  const keys = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const
  const normalized: OauthParams = { ...params, scope: scopes.join(" "), resource }
  const hidden = keys.map((key) => `<input type="hidden" name="${key}" value="${esc(normalized[key])}"/>`).join("")
  const sessionConsent = await issueOAuthContext({
    clientId: params.client_id,
    clientName: client.name,
    clientKind: client.kind,
    redirectUri: params.redirect_uri,
    codeChallenge: params.code_challenge,
    state: params.state,
    resource,
    scopes,
    issuer: valid.issuer,
  })
  const googleQuery = new URLSearchParams(Object.fromEntries(keys.map((key) => [key, normalized[key]]))).toString()
  const googleLogin = isMcpGoogleAuthEnabled()
    ? `
    <a class="gbtn" href="/api/mcp/oauth/google-start?${esc(googleQuery)}">Continuar con Google y autorizar</a>
    <div class="divider"><span></span>o usa tu cuenta del ERP<span></span></div>`
    : ""
  const callbackHost = new URL(params.redirect_uri).host
  const denial = new URL(params.redirect_uri)
  denial.searchParams.set("error", "access_denied")
  denial.searchParams.set("error_description", "El usuario canceló la autorización.")
  if (params.state) denial.searchParams.set("state", params.state)

  return page(`
    <p class="brand">Mentes Brillantes · MCP financiero</p>
    <h1>Autorizar a ${esc(client.name)}</h1>
    <p class="sub">Inicia sesión con tu cuenta personal del ERP. No compartas tu contraseña con otra persona.</p>
    <div class="scope">
      <strong>Permiso solicitado</strong>
      Consultar información financiera del ERP en modo solo lectura.<br/>
      <code>${esc(scopes.join(" "))}</code><br/>
      Retorno seguro: <code>${esc(callbackHost)}</code>
    </div>
    ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}
    <form method="post">
      ${hidden}
      <input type="hidden" name="auth_method" value="session"/>
      <input type="hidden" name="session_consent" value="${esc(sessionConsent)}"/>
      <button class="session-btn" type="submit">Continuar con mi sesión activa del ERP</button>
    </form>
    ${googleLogin}
    <div class="divider"><span></span>o usa correo y contraseña<span></span></div>
    <form method="post">
      ${hidden}
      <input type="hidden" name="auth_method" value="password"/>
      <label for="email">Correo</label>
      <input id="email" name="email" type="email" autocomplete="username" required/>
      <label for="password">Contraseña</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required/>
      <button type="submit">Ingresar y autorizar</button>
    </form>
    <a class="cancel" href="${esc(denial.toString())}">Cancelar</a>
  `)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const params = readOauthParams((key) => url.searchParams.get(key))
  const validation = await validateAuthorizationRequest(req, params)
  if (!validation.ok) return page(`<h1>No se puede autorizar</h1><p class="sub">${esc(validation.error)}</p>`, 400)
  return loginForm(validation.value)
}

async function hasValidSessionConsent(
  token: string,
  validation: ValidAuthorizationRequest,
  params: OauthParams
): Promise<boolean> {
  try {
    const consent = await readOAuthContext(token)
    return (
      consent.clientId === params.client_id &&
      consent.clientName === validation.client.name &&
      consent.clientKind === validation.client.kind &&
      consent.redirectUri === params.redirect_uri &&
      consent.codeChallenge === params.code_challenge &&
      consent.state === params.state &&
      consent.resource === validation.resource &&
      consent.issuer === validation.issuer &&
      consent.scopes.length === validation.scopes.length &&
      consent.scopes.every((scope, index) => scope === validation.scopes[index])
    )
  } catch {
    return false
  }
}

async function completeAuthorization(
  validation: ValidAuthorizationRequest,
  params: OauthParams,
  identity: { userId: string; email: string; role: "admin" | "caja" }
): Promise<Response> {
  try {
    const { client, resource, scopes, issuer } = validation
    const code = await issueAuthCode({
      sub: identity.userId,
      email: identity.email,
      role: identity.role,
      clientId: params.client_id,
      clientName: client.name,
      clientKind: client.kind,
      redirectUri: params.redirect_uri,
      codeChallenge: params.code_challenge,
      resource,
      scopes,
      issuer,
    })
    const redirect = new URL(params.redirect_uri)
    redirect.searchParams.set("code", code)
    if (params.state) redirect.searchParams.set("state", params.state)
    return Response.redirect(redirect.toString(), 302)
  } catch (error) {
    console.error("[mcp] no se pudo emitir el código OAuth", {
      message: error instanceof Error ? error.message : "unknown",
    })
    return page("<h1>No se pudo completar la autorización</h1><p class=\"sub\">Inténtalo de nuevo en unos minutos.</p>", 500)
  }
}

export async function POST(req: Request) {
  const declaredLength = Number(req.headers.get("content-length") || "0")
  if (declaredLength > 32_768) return page("<h1>Solicitud demasiado grande</h1>", 413)
  const form = await req.formData().catch(() => null)
  if (!form) return page("<h1>Solicitud inválida</h1>", 400)
  const params = readOauthParams((key) => (form.get(key) == null ? null : String(form.get(key))))
  const validation = await validateAuthorizationRequest(req, params)
  if (!validation.ok) return page(`<h1>No se puede autorizar</h1><p class="sub">${esc(validation.error)}</p>`, 400)

  const authMethod = String(form.get("auth_method") || "password")
  if (authMethod === "session") {
    const sessionConsent = String(form.get("session_consent") || "")
    if (!(await hasValidSessionConsent(sessionConsent, validation.value, params))) {
      return page("<h1>Solicitud rechazada</h1><p class=\"sub\">El consentimiento de la autorización no es válido o expiró.</p>", 403)
    }
    const sessionClient = await createServerClient()
    if (!sessionClient) return page("<h1>Servidor no configurado</h1>", 500)
    const { data, error } = await sessionClient.auth.getUser()
    if (error || !data?.user) {
      return loginForm(validation.value, "No hay una sesión activa del ERP. Usa tu correo y contraseña.")
    }
    const admin = createAdminClient()
    if (!admin) return page("<h1>Servidor no configurado</h1>", 500)
    const identity = await resolveMcpIdentity(admin, data.user)
    if (!identity) {
      return loginForm(validation.value, "Tu sesión no tiene permiso para el MCP financiero (requiere rol admin o caja).")
    }
    return completeAuthorization(validation.value, params, identity)
  }
  if (authMethod !== "password") return page("<h1>Método de acceso no permitido</h1>", 400)

  const email = String(form.get("email") || "").trim()
  const password = String(form.get("password") || "")
  if (!email || !password) return loginForm(validation.value, "Escribe tu correo y contraseña.")

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return page("<h1>Servidor no configurado</h1>", 500)

  const anon = createPasswordClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data?.user) return loginForm(validation.value, "Correo o contraseña incorrectos.")

  const admin = createAdminClient()
  if (!admin) return page("<h1>Servidor no configurado</h1>", 500)
  const identity = await resolveMcpIdentity(admin, data.user)
  if (!identity) {
    return loginForm(validation.value, "Tu cuenta no tiene permiso para el MCP financiero (requiere rol admin o caja).")
  }

  return completeAuthorization(validation.value, params, identity)
}
