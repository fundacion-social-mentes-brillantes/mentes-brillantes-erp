import { afterEach, describe, expect, it, vi } from "vitest"
import { createHash } from "node:crypto"
import {
  getMcpResource,
  MCP_RESOURCE_PATH,
  normalizeRequestedScopes,
} from "../constants"
import {
  isTrustedRedirectUri,
  redirectUriAllowed,
  validateRedirectUris,
  verifyPkceS256,
} from "../oauth"
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
} from "../metadata"
import { POST as registerClient } from "@/app/api/mcp/oauth/register/route"
import { GET as getRootProtectedMetadata } from "@/app/.well-known/oauth-protected-resource/route"
import { GET as getPathProtectedMetadata } from "@/app/.well-known/oauth-protected-resource/api/mcp/mcp/route"

const PUBLIC_ORIGIN = "https://mentes-brillantes-erp.vercel.app"
const CANONICAL_RESOURCE = `${PUBLIC_ORIGIN}${MCP_RESOURCE_PATH}`

function proxiedRequest(path = "/"): Request {
  return new Request(`http://internal.local${path}`, {
    headers: {
      "x-forwarded-host": "mentes-brillantes-erp.vercel.app",
      "x-forwarded-proto": "https",
    },
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("recurso MCP canónico", () => {
  it("incluye la ruta Streamable HTTP completa y respeta el origen público", () => {
    expect(getMcpResource(proxiedRequest("/api/mcp/mcp"))).toBe(CANONICAL_RESOURCE)
  })

  it("publica el mismo recurso exacto en los metadatos protegidos raíz y específicos", async () => {
    for (const handler of [getRootProtectedMetadata, getPathProtectedMetadata]) {
      const response = handler(proxiedRequest())
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toContain("no-store")
      expect(await response.json()).toMatchObject({
        resource: CANONICAL_RESOURCE,
        authorization_servers: [PUBLIC_ORIGIN],
        bearer_methods_supported: ["header"],
        scopes_supported: ["erp.read"],
      })
    }
  })
})

describe("scopes OAuth admitidos", () => {
  it.each([
    [undefined, ["erp.read"]],
    ["erp.read", ["erp.read"]],
    ["erp.read offline_access", ["erp.read", "offline_access"]],
    ["offline_access erp.read erp.read", ["offline_access", "erp.read"]],
  ])("normaliza %s", (value, expected) => {
    expect(normalizeRequestedScopes(value)).toEqual(expected)
  })

  it.each([
    ["offline_access"],
    ["erp.write"],
    ["erp.read erp.write"],
  ])("rechaza scopes ausentes o no soportados: %s", (value) => {
    expect(normalizeRequestedScopes(value)).toBeNull()
  })
})

describe("Dynamic Client Registration", () => {
  const allowed = [
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback",
    "https://chatgpt.com/connector/oauth/callback_7F4f-92",
    "http://127.0.0.1:49152/callback",
    "http://localhost:49153/callback",
  ]

  it.each(allowed)("admite el callback oficial o loopback %s", (uri) => {
    vi.stubEnv("MCP_ALLOWED_REDIRECT_URIS", "")
    expect(isTrustedRedirectUri(uri)).toBe(true)
    expect(validateRedirectUris([uri])).toEqual([uri])
  })

  it.each([
    "javascript:alert(1)",
    "https://attacker.example/callback",
  ])("rechaza el callback no confiable %s", (uri) => {
    vi.stubEnv("MCP_ALLOWED_REDIRECT_URIS", "")
    expect(isTrustedRedirectUri(uri)).toBe(false)
    expect(validateRedirectUris([uri])).toBeNull()
  })

  it("registra un cliente público con callbacks permitidos", async () => {
    vi.stubEnv("MCP_OAUTH_SIGNING_SECRET", "test-only-secret-never-used-outside-vitest")
    vi.stubEnv("MCP_ALLOWED_REDIRECT_URIS", "")

    const response = await registerClient(new Request(`${PUBLIC_ORIGIN}/api/mcp/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Integración de prueba",
        redirect_uris: allowed,
        token_endpoint_auth_method: "none",
      }),
    }))

    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(await response.json()).toMatchObject({
      redirect_uris: allowed,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "erp.read offline_access",
    })
  })

  it.each([
    "javascript:alert(1)",
    "https://attacker.example/callback",
  ])("rechaza por DCR el callback %s", async (redirectUri) => {
    vi.stubEnv("MCP_OAUTH_SIGNING_SECRET", "test-only-secret-never-used-outside-vitest")
    vi.stubEnv("MCP_ALLOWED_REDIRECT_URIS", "")

    const response = await registerClient(new Request(`${PUBLIC_ORIGIN}/api/mcp/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: [redirectUri] }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: "invalid_redirect_uri" })
  })

  it("admite el puerto efímero de un callback loopback registrado sin puerto", () => {
    expect(
      redirectUriAllowed("http://127.0.0.1:49152/callback", ["http://127.0.0.1/callback"])
    ).toBe(true)
    expect(
      redirectUriAllowed("http://127.0.0.1:49152/otra-ruta", ["http://127.0.0.1/callback"])
    ).toBe(false)
  })
})

describe("PKCE S256", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
  const challenge = createHash("sha256").update(verifier).digest("base64url")

  it("acepta un verifier válido con su challenge S256", () => {
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    expect(verifyPkceS256(verifier, challenge)).toBe(true)
  })

  it("rechaza challenge incorrecto y verifier fuera de RFC 7636", () => {
    expect(verifyPkceS256(verifier, `${challenge.slice(0, -1)}A`)).toBe(false)
    expect(verifyPkceS256("demasiado-corto", challenge)).toBe(false)
  })
})

describe("metadatos OAuth", () => {
  it("anuncia Authorization Code, refresh, PKCE S256 y los scopes soportados", () => {
    expect(authorizationServerMetadata(proxiedRequest())).toMatchObject({
      issuer: PUBLIC_ORIGIN,
      authorization_endpoint: `${PUBLIC_ORIGIN}/api/mcp/oauth/authorize`,
      token_endpoint: `${PUBLIC_ORIGIN}/api/mcp/oauth/token`,
      registration_endpoint: `${PUBLIC_ORIGIN}/api/mcp/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["erp.read", "offline_access"],
    })
  })

  it("mantiene separados el recurso protegido y el issuer OAuth", () => {
    expect(protectedResourceMetadata(proxiedRequest())).toMatchObject({
      resource: CANONICAL_RESOURCE,
      authorization_servers: [PUBLIC_ORIGIN],
      scopes_supported: ["erp.read"],
    })
  })
})
