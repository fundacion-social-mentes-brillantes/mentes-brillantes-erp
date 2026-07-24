import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  createServerClientMock,
  createAdminClientMock,
  getUserMock,
  issueAuthCodeMock,
  resolveMcpIdentityMock,
} = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  getUserMock: vi.fn(),
  issueAuthCodeMock: vi.fn(),
  resolveMcpIdentityMock: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: createServerClientMock,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}))

vi.mock("@/lib/mcp/identity", () => ({
  resolveMcpIdentity: resolveMcpIdentityMock,
}))

vi.mock("@/lib/mcp/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp/oauth")>()
  return {
    ...actual,
    issueAuthCode: issueAuthCodeMock,
  }
})

import { GET as authorizeGet, POST as authorizePost } from "@/app/api/mcp/oauth/authorize/route"
import { GET as googleStartGet } from "@/app/api/mcp/oauth/google-start/route"
import { POST as registerClient } from "@/app/api/mcp/oauth/register/route"

const PUBLIC_ORIGIN = "https://mentes-brillantes-erp.vercel.app"
const REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback"
const RESOURCE = `${PUBLIC_ORIGIN}/api/mcp/mcp`

async function authorizationParams(): Promise<URLSearchParams> {
  const registration = await registerClient(
    new Request(`${PUBLIC_ORIGIN}/api/mcp/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Cliente de prueba",
        redirect_uris: [REDIRECT_URI],
        token_endpoint_auth_method: "none",
      }),
    })
  )
  expect(registration.status).toBe(201)
  const { client_id: clientId } = (await registration.json()) as { client_id: string }
  return new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    code_challenge: "A".repeat(43),
    code_challenge_method: "S256",
    state: "state-de-prueba",
    scope: "erp.read",
    resource: RESOURCE,
  })
}

function authorizationGetRequest(params: URLSearchParams): Request {
  return new Request(`${PUBLIC_ORIGIN}/api/mcp/oauth/authorize?${params.toString()}`)
}

function authorizationPostRequest(
  params: URLSearchParams,
  authMethod: "session" | "password",
  sessionConsent = ""
): Request {
  const form = new URLSearchParams(params)
  form.set("auth_method", authMethod)
  if (sessionConsent) form.set("session_consent", sessionConsent)
  return new Request(`${PUBLIC_ORIGIN}/api/mcp/oauth/authorize`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  })
}

async function readSessionConsent(params: URLSearchParams): Promise<string> {
  const response = await authorizeGet(authorizationGetRequest(params))
  const html = await response.text()
  const match = html.match(/name="session_consent" value="([^"]+)"/)
  expect(match?.[1]).toBeTruthy()
  return match![1]
}

beforeEach(() => {
  vi.stubEnv("MCP_OAUTH_SIGNING_SECRET", "test-only-secret-never-used-outside-vitest")
  vi.stubEnv("MCP_ALLOWED_REDIRECT_URIS", "")
  vi.stubEnv("MCP_GOOGLE_AUTH_ENABLED", "false")
  createServerClientMock.mockReset()
  createAdminClientMock.mockReset()
  getUserMock.mockReset()
  issueAuthCodeMock.mockReset()
  resolveMcpIdentityMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("opciones de acceso OAuth del MCP", () => {
  it("muestra sesión activa y correo, pero oculta Google por defecto", async () => {
    const params = await authorizationParams()
    const response = await authorizeGet(authorizationGetRequest(params))
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('name="auth_method" value="session"')
    expect(html).toContain('name="session_consent" value="')
    expect(html).toContain('name="auth_method" value="password"')
    expect(html).not.toContain("/api/mcp/oauth/google-start?")
    expect(html).not.toContain("Continuar con Google")
  })

  it("solo muestra Google cuando la variable server-side es exactamente true", async () => {
    vi.stubEnv("MCP_GOOGLE_AUTH_ENABLED", "true")
    const params = await authorizationParams()
    const response = await authorizeGet(authorizationGetRequest(params))
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain("/api/mcp/oauth/google-start?")
    expect(html).toContain("Continuar con Google")
  })

  it("mantiene google-start cerrado con 404 mientras Google está deshabilitado", async () => {
    const disabled = await googleStartGet(
      new Request(`${PUBLIC_ORIGIN}/api/mcp/oauth/google-start`)
    )
    expect(disabled.status).toBe(404)
    expect(disabled.headers.get("cache-control")).toContain("no-store")

    vi.stubEnv("MCP_GOOGLE_AUTH_ENABLED", "true")
    const enabledButInvalid = await googleStartGet(
      new Request(`${PUBLIC_ORIGIN}/api/mcp/oauth/google-start`)
    )
    expect(enabledButInvalid.status).toBe(400)
  })
})

describe("continuar con la sesión activa del ERP", () => {
  it("reutiliza la sesión SSR, valida identidad y emite el mismo código OAuth", async () => {
    const params = await authorizationParams()
    const sessionConsent = await readSessionConsent(params)
    const sessionUser = { id: "usuario-seguro" }
    const admin = { kind: "admin-client" }
    getUserMock.mockResolvedValue({ data: { user: sessionUser }, error: null })
    createServerClientMock.mockResolvedValue({ auth: { getUser: getUserMock } })
    createAdminClientMock.mockReturnValue(admin)
    resolveMcpIdentityMock.mockResolvedValue({
      userId: sessionUser.id,
      email: "usuario@example.test",
      role: "admin",
    })
    issueAuthCodeMock.mockResolvedValue("codigo-emitido")

    const response = await authorizePost(
      authorizationPostRequest(params, "session", sessionConsent)
    )
    const redirect = new URL(response.headers.get("location")!)

    expect(response.status).toBe(302)
    expect(redirect.origin + redirect.pathname).toBe(REDIRECT_URI)
    expect(redirect.searchParams.get("code")).toBe("codigo-emitido")
    expect(redirect.searchParams.get("state")).toBe("state-de-prueba")
    expect(getUserMock).toHaveBeenCalledOnce()
    expect(resolveMcpIdentityMock).toHaveBeenCalledWith(admin, sessionUser)
    expect(issueAuthCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: sessionUser.id,
        role: "admin",
        redirectUri: REDIRECT_URI,
        resource: RESOURCE,
        scopes: ["erp.read"],
      })
    )
  })

  it("rechaza la sesión sin consentimiento firmado o si cambian los parámetros OAuth", async () => {
    const params = await authorizationParams()
    const sessionConsent = await readSessionConsent(params)
    const missingConsentForm = new URLSearchParams(params)
    missingConsentForm.set("auth_method", "session")
    const missingConsent = await authorizePost(
      new Request(`${PUBLIC_ORIGIN}/api/mcp/oauth/authorize`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: missingConsentForm,
      })
    )
    const changedParams = new URLSearchParams(params)
    changedParams.set("state", "estado-alterado")
    const changedRequest = await authorizePost(
      authorizationPostRequest(changedParams, "session", sessionConsent)
    )

    expect(missingConsent.status).toBe(403)
    expect(changedRequest.status).toBe(403)
    expect(createServerClientMock).not.toHaveBeenCalled()
    expect(issueAuthCodeMock).not.toHaveBeenCalled()
  })
})
