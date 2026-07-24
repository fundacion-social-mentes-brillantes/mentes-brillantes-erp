import { afterEach, describe, expect, it, vi } from "vitest"
import { getAdminUserById } from "../admin"

const USER_ID = "11111111-1111-4111-8111-111111111111"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function configuredEnv(key: string) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", key)
}

describe("consulta Auth Admin", () => {
  it("envía una clave sb_secret únicamente como apikey", async () => {
    configuredEnv("sb_secret_server_test")
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: USER_ID, email: "admin@example.test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(getAdminUserById(USER_ID)).resolves.toMatchObject({
      user: { id: USER_ID },
      error: null,
    })

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get("apikey")).toBe("sb_secret_server_test")
    expect(headers.get("authorization")).toBeNull()
  })

  it("conserva Authorization para una clave service_role JWT heredada", async () => {
    configuredEnv("legacy.jwt.service-role")
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await getAdminUserById(USER_ID)

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get("apikey")).toBe("legacy.jwt.service-role")
    expect(headers.get("authorization")).toBe("Bearer legacy.jwt.service-role")
  })

  it("falla de forma cerrada si Auth Admin no responde correctamente", async () => {
    configuredEnv("sb_secret_server_test")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    await expect(getAdminUserById(USER_ID)).resolves.toEqual({
      user: null,
      error: "http_503",
    })
  })
})
