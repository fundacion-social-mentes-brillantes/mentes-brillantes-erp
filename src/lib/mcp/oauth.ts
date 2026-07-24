import { SignJWT, jwtVerify } from "jose"
import { createHash, createHmac, randomBytes } from "node:crypto"

// ============================================================================
// OAuth 2.1 (PKCE) AUTOCONTENIDO para el MCP financiero.
//
// El propio ERP es el Authorization Server. NO se necesita Google/Azure ni
// crear cuentas: cada usuario inicia sesión con su MISMA cuenta del ERP
// (Supabase email + contraseña). Todo es sin estado (stateless): los client_id,
// los códigos y los tokens son JWT firmados con una clave derivada del
// SUPABASE_SERVICE_ROLE_KEY (que ya existe en Vercel) → CERO variables nuevas.
// ============================================================================

export type ErpRole = "admin" | "caja" | "consulta"

const ISSUER_PATH = "" // el issuer es el origin (se calcula por request)
const TOKEN_TTL = 60 * 60 // 1h
const REFRESH_TTL = 60 * 60 * 24 * 30 // 30d
const CODE_TTL = 60 * 5 // 5 min

function signingKey(): Uint8Array {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!base) throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada")
  // Deriva una clave estable de 256 bits para firmar los JWT del MCP.
  return new Uint8Array(createHmac("sha256", base).update("mcp-oauth-signing-v1").digest())
}

export function isConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// ---- PKCE ----
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false
  const hash = createHash("sha256").update(verifier).digest("base64url")
  return timingSafeEqual(hash, challenge)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function randomId(): string {
  return randomBytes(16).toString("hex")
}

// ---- client_id auto-contenido (Dynamic Client Registration sin BD) ----
export async function issueClientId(redirectUris: string[], clientName?: string): Promise<string> {
  return new SignJWT({ typ: "client", redirect_uris: redirectUris, name: clientName || "mcp-client" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(signingKey())
}

export async function readClientId(clientId: string): Promise<{ redirect_uris: string[] } | null> {
  try {
    const { payload } = await jwtVerify(clientId, signingKey())
    if (payload.typ !== "client") return null
    const uris = Array.isArray(payload.redirect_uris) ? (payload.redirect_uris as string[]) : []
    return { redirect_uris: uris }
  } catch {
    return null
  }
}

// ---- Código de autorización (JWT corto que amarra PKCE + usuario) ----
export async function issueAuthCode(params: {
  sub: string
  email: string
  role: ErpRole
  clientId: string
  redirectUri: string
  codeChallenge: string
}): Promise<string> {
  return new SignJWT({
    typ: "code",
    sub: params.sub,
    email: params.email,
    role: params.role,
    cid: params.clientId,
    redirect_uri: params.redirectUri,
    cc: params.codeChallenge,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CODE_TTL}s`)
    .sign(signingKey())
}

export async function readAuthCode(code: string) {
  const { payload } = await jwtVerify(code, signingKey())
  if (payload.typ !== "code") throw new Error("tipo de código inválido")
  return payload as any
}

// ---- Access / Refresh tokens ----
export async function issueTokens(params: { sub: string; email: string; role: ErpRole; audience: string; issuer: string }) {
  const common = { sub: params.sub, email: params.email, role: params.role }
  const access_token = await new SignJWT({ ...common, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(params.issuer)
    .setAudience(params.audience)
    .setExpirationTime(`${TOKEN_TTL}s`)
    .sign(signingKey())
  const refresh_token = await new SignJWT({ ...common, typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(params.issuer)
    .setExpirationTime(`${REFRESH_TTL}s`)
    .sign(signingKey())
  return { access_token, refresh_token, expires_in: TOKEN_TTL }
}

export async function verifyAccessToken(token: string, opts: { audience: string; issuer: string }) {
  const { payload } = await jwtVerify(token, signingKey(), {
    issuer: opts.issuer,
    audience: opts.audience,
    clockTolerance: 30,
  })
  if (payload.typ !== "access") throw new Error("tipo de token inválido")
  return payload as any
}

export async function verifyRefreshToken(token: string, opts: { issuer: string }) {
  const { payload } = await jwtVerify(token, signingKey(), { issuer: opts.issuer, clockTolerance: 30 })
  if (payload.typ !== "refresh") throw new Error("tipo de token inválido")
  return payload as any
}

// Valida que un redirect_uri esté permitido para el cliente (evita open redirect).
export function redirectUriAllowed(uri: string, allowed: string[]): boolean {
  return allowed.includes(uri)
}

// Contexto OAuth del MCP que viaja (en cookie firmada) durante el login con
// Google, para poder retomar el flujo al volver del proveedor.
export type OAuthContext = { clientId: string; redirectUri: string; codeChallenge: string; state: string }

export async function issueOAuthContext(ctx: OAuthContext): Promise<string> {
  return new SignJWT({ typ: "ctx", ...ctx })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(signingKey())
}

export async function readOAuthContext(token: string): Promise<OAuthContext> {
  const { payload } = await jwtVerify(token, signingKey())
  if (payload.typ !== "ctx") throw new Error("contexto inválido")
  return {
    clientId: String(payload.clientId || ""),
    redirectUri: String(payload.redirectUri || ""),
    codeChallenge: String(payload.codeChallenge || ""),
    state: String(payload.state || ""),
  }
}

export const OAUTH_CTX_COOKIE = "mcp_oauth_ctx"

export const OAUTH_TTL = { TOKEN_TTL, REFRESH_TTL, CODE_TTL }
export const _ISSUER_PATH = ISSUER_PATH
