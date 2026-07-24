import { SignJWT, jwtVerify, type JWTPayload } from "jose"
import { createHash, createHmac, randomBytes } from "node:crypto"
import {
  consumeRefreshToken,
  hashOAuthValue,
  newTokenFamilyId,
  randomOpaqueToken,
  redeemAuthorizationCodeOnce,
  rememberAuthorizationCode,
  rememberRefreshToken,
  revokeTokenFamily,
} from "./oauth-store"

export type ErpRole = "admin" | "caja" | "consulta"
export type McpClientKind = "chatgpt" | "claude" | "claude-code" | "other"

const TOKEN_TTL = 60 * 15
const REFRESH_TTL = 60 * 60 * 24 * 30
const CODE_TTL = 60 * 5
const CLIENT_TTL = 60 * 60 * 24 * 365

function signingKey(): Uint8Array {
  const base = process.env.MCP_OAUTH_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!base) throw new Error("MCP_OAUTH_SIGNING_SECRET o SUPABASE_SERVICE_ROLE_KEY no configurada")
  return new Uint8Array(createHmac("sha256", base).update("mcp-oauth-signing-v2").digest())
}

function keyId(): string {
  return createHash("sha256").update(signingKey()).digest("hex").slice(0, 12)
}

export function isConfigured(): boolean {
  return Boolean(process.env.MCP_OAUTH_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return false
  const hash = createHash("sha256").update(verifier).digest("base64url")
  return timingSafeEqual(hash, challenge)
}

export function randomId(): string {
  return randomBytes(16).toString("hex")
}

export type RegisteredMcpClient = {
  redirect_uris: string[]
  name: string
  kind: McpClientKind
}

function inferClientKind(redirectUris: string[], clientName: string): McpClientKind {
  if (redirectUris.some((uri) => uri.startsWith("https://chatgpt.com/connector/oauth/"))) return "chatgpt"
  if (
    redirectUris.includes("https://claude.ai/api/mcp/auth_callback") ||
    redirectUris.includes("https://claude.com/api/mcp/auth_callback")
  ) {
    return "claude"
  }
  if (redirectUris.some((uri) => {
    try {
      const url = new URL(uri)
      return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)
    } catch {
      return false
    }
  })) return "claude-code"
  const normalized = clientName.toLowerCase()
  if (normalized.includes("chatgpt") || normalized.includes("openai")) return "chatgpt"
  if (normalized.includes("claude")) return "claude"
  return "other"
}

function extraAllowedRedirects(): Set<string> {
  return new Set(
    String(process.env.MCP_ALLOWED_REDIRECT_URIS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )
}

export function isTrustedRedirectUri(uri: string): boolean {
  if (!uri || uri.length > 2048) return false
  try {
    const url = new URL(uri)
    if (url.username || url.password || url.hash) return false
    if (extraAllowedRedirects().has(uri)) {
      const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)
      return url.protocol === "https:" || (loopback && url.protocol === "http:")
    }
    if (
      url.protocol === "https:" &&
      (url.hostname === "claude.ai" || url.hostname === "claude.com") &&
      url.pathname === "/api/mcp/auth_callback"
    ) {
      return true
    }
    if (
      url.protocol === "https:" &&
      url.hostname === "chatgpt.com" &&
      /^\/connector\/oauth\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    ) {
      return true
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)
    return loopback && url.protocol === "http:"
  } catch {
    return false
  }
}

export function validateRedirectUris(values: unknown): string[] | null {
  if (!Array.isArray(values) || values.length < 1 || values.length > 5) return null
  const uris = Array.from(
    new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()))
  )
  if (uris.length !== values.length || uris.some((uri) => !isTrustedRedirectUri(uri))) return null
  return uris
}

export async function issueClientId(redirectUris: string[], clientName?: string): Promise<string> {
  const safeName = String(clientName || "Cliente MCP").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) || "Cliente MCP"
  return new SignJWT({
    typ: "client",
    redirect_uris: redirectUris,
    name: safeName,
    kind: inferClientKind(redirectUris, safeName),
  })
    .setProtectedHeader({ alg: "HS256", kid: keyId(), typ: "JWT" })
    .setIssuedAt()
    .setJti(randomId())
    .setExpirationTime(`${CLIENT_TTL}s`)
    .sign(signingKey())
}

export async function readClientId(clientId: string): Promise<RegisteredMcpClient | null> {
  try {
    const { payload } = await jwtVerify(clientId, signingKey(), { clockTolerance: 30 })
    if (payload.typ !== "client") return null
    const uris = validateRedirectUris(payload.redirect_uris)
    if (!uris) return null
    const name = String(payload.name || "Cliente MCP").slice(0, 120)
    const kind = ["chatgpt", "claude", "claude-code", "other"].includes(String(payload.kind))
      ? (payload.kind as McpClientKind)
      : inferClientKind(uris, name)
    return { redirect_uris: uris, name, kind }
  } catch {
    return null
  }
}

export type AuthorizationCodeClaims = JWTPayload & {
  typ: "code"
  sub: string
  email: string
  role: ErpRole
  cid: string
  cname: string
  ckind: McpClientKind
  redirect_uri: string
  cc: string
  resource: string
  scope: string
}

export async function issueAuthCode(params: {
  sub: string
  email: string
  role: ErpRole
  clientId: string
  clientName: string
  clientKind: McpClientKind
  redirectUri: string
  codeChallenge: string
  resource: string
  scopes: string[]
  issuer: string
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const code = await new SignJWT({
    typ: "code",
    email: params.email,
    role: params.role,
    cid: params.clientId,
    cname: params.clientName,
    ckind: params.clientKind,
    redirect_uri: params.redirectUri,
    cc: params.codeChallenge,
    resource: params.resource,
    scope: params.scopes.join(" "),
  })
    .setProtectedHeader({ alg: "HS256", kid: keyId(), typ: "JWT" })
    .setSubject(params.sub)
    .setIssuer(params.issuer)
    .setAudience(params.resource)
    .setIssuedAt(now)
    .setJti(randomId())
    .setExpirationTime(now + CODE_TTL)
    .sign(signingKey())

  await rememberAuthorizationCode({
    code,
    userId: params.sub,
    clientId: params.clientId,
    resource: params.resource,
    expiresAt: new Date((now + CODE_TTL) * 1000),
  })
  return code
}

export async function readAuthCode(
  code: string,
  opts: { issuer: string; resource: string }
): Promise<AuthorizationCodeClaims> {
  const { payload } = await jwtVerify(code, signingKey(), {
    issuer: opts.issuer,
    audience: opts.resource,
    clockTolerance: 30,
  })
  if (payload.typ !== "code") throw new Error("tipo de código inválido")
  return payload as AuthorizationCodeClaims
}

export { redeemAuthorizationCodeOnce }

export async function issueTokens(params: {
  sub: string
  email: string
  role: ErpRole
  clientId: string
  clientName: string
  clientKind: McpClientKind
  resource: string
  issuer: string
  scopes: string[]
  familyId?: string
}) {
  const now = Math.floor(Date.now() / 1000)
  const familyId = params.familyId || newTokenFamilyId()
  const clientIdHash = hashOAuthValue(params.clientId)
  const access_token = await new SignJWT({
    typ: "access",
    email: params.email,
    role: params.role,
    cid: clientIdHash,
    cname: params.clientName,
    ckind: params.clientKind,
    scope: params.scopes,
    resource: params.resource,
    sid: familyId,
  })
    .setProtectedHeader({ alg: "HS256", kid: keyId(), typ: "at+jwt" })
    .setSubject(params.sub)
    .setIssuer(params.issuer)
    .setAudience(params.resource)
    .setIssuedAt(now)
    .setJti(randomId())
    .setExpirationTime(now + TOKEN_TTL)
    .sign(signingKey())

  const refresh_token = randomOpaqueToken()
  await rememberRefreshToken({
    token: refresh_token,
    userId: params.sub,
    email: params.email,
    role: params.role,
    clientId: params.clientId,
    clientName: params.clientName,
    resource: params.resource,
    scopes: params.scopes,
    familyId,
    expiresAt: new Date((now + REFRESH_TTL) * 1000),
  })

  return { access_token, refresh_token, expires_in: TOKEN_TTL, family_id: familyId }
}

export async function verifyAccessToken(token: string, opts: { audience: string; issuer: string }) {
  const { payload } = await jwtVerify(token, signingKey(), {
    issuer: opts.issuer,
    audience: opts.audience,
    clockTolerance: 30,
  })
  if (payload.typ !== "access" || payload.resource !== opts.audience) throw new Error("tipo o recurso de token inválido")
  return payload as JWTPayload & {
    typ: "access"
    email: string
    role: ErpRole
    cid: string
    cname: string
    ckind: McpClientKind
    scope: string[]
    resource: string
    sid: string
  }
}

export { consumeRefreshToken }
export { hashOAuthValue, revokeTokenFamily }

function loopbackRedirectMatches(actualUri: string, registeredUri: string): boolean {
  try {
    const actual = new URL(actualUri)
    const registered = new URL(registeredUri)
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])
    return (
      actual.protocol === "http:" &&
      registered.protocol === "http:" &&
      loopbackHosts.has(actual.hostname) &&
      actual.hostname === registered.hostname &&
      registered.port === "" &&
      actual.pathname === registered.pathname &&
      actual.search === registered.search &&
      !actual.hash &&
      !registered.hash &&
      !actual.username &&
      !actual.password
    )
  } catch {
    return false
  }
}

export function redirectUriAllowed(uri: string, allowed: string[]): boolean {
  return (
    isTrustedRedirectUri(uri) &&
    allowed.some((registered) => registered === uri || loopbackRedirectMatches(uri, registered))
  )
}

export type OAuthContext = {
  clientId: string
  clientName: string
  clientKind: McpClientKind
  redirectUri: string
  codeChallenge: string
  state: string
  resource: string
  scopes: string[]
  issuer: string
}

export async function issueOAuthContext(ctx: OAuthContext): Promise<string> {
  return new SignJWT({ typ: "ctx", ...ctx })
    .setProtectedHeader({ alg: "HS256", kid: keyId(), typ: "JWT" })
    .setIssuedAt()
    .setJti(randomId())
    .setExpirationTime("10m")
    .sign(signingKey())
}

export async function readOAuthContext(token: string): Promise<OAuthContext> {
  const { payload } = await jwtVerify(token, signingKey(), { clockTolerance: 30 })
  if (payload.typ !== "ctx") throw new Error("contexto inválido")
  return {
    clientId: String(payload.clientId || ""),
    clientName: String(payload.clientName || ""),
    clientKind: payload.clientKind as McpClientKind,
    redirectUri: String(payload.redirectUri || ""),
    codeChallenge: String(payload.codeChallenge || ""),
    state: String(payload.state || ""),
    resource: String(payload.resource || ""),
    scopes: Array.isArray(payload.scopes) ? payload.scopes.map(String) : [],
    issuer: String(payload.issuer || ""),
  }
}

export const OAUTH_CTX_COOKIE = "mcp_oauth_ctx"
export const OAUTH_TTL = { TOKEN_TTL, REFRESH_TTL, CODE_TTL, CLIENT_TTL }
