import { createClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { issueAuthCode, readClientId, redirectUriAllowed, type ErpRole } from "@/lib/mcp/oauth"

// Authorization endpoint (OAuth 2.1 + PKCE). GET muestra el login del ERP;
// POST valida credenciales contra Supabase y emite el código de autorización.
export const dynamic = "force-dynamic"

type OauthParams = {
  client_id: string
  redirect_uri: string
  response_type: string
  code_challenge: string
  code_challenge_method: string
  state: string
  scope: string
  resource: string
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))
}

function readParams(get: (key: string) => string | null): OauthParams {
  return {
    client_id: get("client_id") || "",
    redirect_uri: get("redirect_uri") || "",
    response_type: get("response_type") || "",
    code_challenge: get("code_challenge") || "",
    code_challenge_method: get("code_challenge_method") || "",
    state: get("state") || "",
    scope: get("scope") || "",
    resource: get("resource") || "",
  }
}

async function validate(params: OauthParams): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!params.client_id) return { ok: false, error: "Falta client_id." }
  const client = await readClientId(params.client_id)
  if (!client) return { ok: false, error: "client_id inválido." }
  if (!params.redirect_uri || !redirectUriAllowed(params.redirect_uri, client.redirect_uris)) {
    return { ok: false, error: "redirect_uri no permitido." }
  }
  if (params.response_type !== "code") return { ok: false, error: "response_type debe ser 'code'." }
  if (!params.code_challenge || params.code_challenge_method !== "S256") {
    return { ok: false, error: "Se requiere PKCE con method S256." }
  }
  return { ok: true }
}

function page(bodyInner: string, status = 200): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Acceso — Mentes Brillantes MCP</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:radial-gradient(circle at 76% 20%,rgba(211,182,87,.18),transparent 60%),linear-gradient(135deg,#0f1c25,#060c11);color:#f1f6f0;padding:24px}
.card{width:100%;max-width:400px;background:rgba(13,21,27,.96);border:1px solid rgba(221,178,87,.3);border-radius:20px;padding:28px;box-shadow:0 24px 70px rgba(0,0,0,.5)}
h1{font-size:1.15rem;margin:0 0 4px}p.sub{color:#a3b0a6;font-size:.85rem;margin:0 0 20px}
label{display:block;font-size:.8rem;color:#a3b0a6;margin:14px 0 6px}
input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(120,140,150,.4);background:#0a1016;color:#f1f6f0;font-size:16px}
button{width:100%;margin-top:22px;padding:13px;border:none;border-radius:12px;font-weight:700;font-size:1rem;cursor:pointer;background:linear-gradient(135deg,#32d396,#1cb280);color:#031a12}
.err{background:rgba(251,113,133,.15);border:1px solid rgba(251,113,133,.4);color:#fda4af;padding:10px 12px;border-radius:10px;font-size:.85rem;margin-bottom:8px}
.brand{font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:#dbb257;font-weight:700}
.gbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:12px;border-radius:12px;border:1px solid rgba(120,140,150,.5);background:#0a1016;color:#f1f6f0;font-weight:600;font-size:.95rem;text-decoration:none;margin-top:6px}
.gbtn:hover{background:#111a22}
.divider{display:flex;align-items:center;gap:10px;color:#7d8c92;font-size:.8rem;margin:16px 0}
.divider span{height:1px;flex:1;background:rgba(120,140,150,.35)}
</style></head><body><div class="card">${bodyInner}</div></body></html>`
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } })
}

function loginForm(params: OauthParams, error?: string): Response {
  const keys = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const
  const hidden = keys.map((k) => `<input type="hidden" name="${k}" value="${esc(params[k])}"/>`).join("")
  const googleQuery = new URLSearchParams(Object.fromEntries(keys.map((k) => [k, params[k]]))).toString()
  const googleHref = `/api/mcp/oauth/google-start?${googleQuery}`
  return page(`
    <p class="brand">Mentes Brillantes · MCP Financiero</p>
    <h1>Conectar con Claude</h1>
    <p class="sub">Inicia sesión con tu cuenta del ERP para autorizar el acceso (solo lectura).</p>
    ${error ? `<div class="err">${esc(error)}</div>` : ""}
    <a class="gbtn" href="${esc(googleHref)}">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      Continuar con Google
    </a>
    <div class="divider"><span></span>o<span></span></div>
    <form method="post">
      ${hidden}
      <label for="email">Correo</label>
      <input id="email" name="email" type="email" autocomplete="username" required/>
      <label for="password">Contraseña</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required/>
      <button type="submit">Autorizar acceso</button>
    </form>
  `)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const params = readParams((k) => url.searchParams.get(k))
  const v = await validate(params)
  if (!v.ok) return page(`<h1>No se puede autorizar</h1><p class="sub">${esc(v.error)}</p>`, 400)
  return loginForm(params)
}

export async function POST(req: Request) {
  const form = await req.formData()
  const params = readParams((k) => (form.get(k) != null ? String(form.get(k)) : null))
  const v = await validate(params)
  if (!v.ok) return page(`<h1>No se puede autorizar</h1><p class="sub">${esc(v.error)}</p>`, 400)

  const email = String(form.get("email") || "").trim()
  const password = String(form.get("password") || "")
  if (!email || !password) return loginForm(params, "Escribe tu correo y contraseña.")

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return page(`<h1>Servidor no configurado</h1>`, 500)

  // Autentica contra la MISMA cuenta del ERP (Supabase).
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data?.user) {
    return loginForm(params, "Correo o contraseña incorrectos.")
  }

  // Verifica el rol: solo admin/caja pueden usar el MCP financiero.
  const admin = createAdminClient()
  if (!admin) return page(`<h1>Servidor no configurado</h1>`, 500)
  const { data: perfil } = await admin.from("perfiles").select("rol").eq("id", data.user.id).single()
  const role = perfil?.rol as ErpRole | undefined
  if (role !== "admin" && role !== "caja") {
    return loginForm(params, "Tu cuenta no tiene permiso para el MCP financiero (requiere admin o caja).")
  }

  const code = await issueAuthCode({
    sub: data.user.id,
    email: data.user.email || email,
    role,
    clientId: params.client_id,
    redirectUri: params.redirect_uri,
    codeChallenge: params.code_challenge,
  })

  const redirect = new URL(params.redirect_uri)
  redirect.searchParams.set("code", code)
  if (params.state) redirect.searchParams.set("state", params.state)
  return Response.redirect(redirect.toString(), 302)
}
