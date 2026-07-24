import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { afterEach, describe, expect, it, vi } from "vitest"

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}))

import { McpAuditError, auditMcpToolCall } from "../audit"
import { executeTool, registerErpTools } from "../erp-tools"
import { resolveCurrentMcpIdentity } from "../identity"

const AUTHENTICATED_UUID = "11111111-1111-4111-8111-111111111111"

function identityAdmin(params: {
  user?: Record<string, unknown>
  authError?: unknown
  profile?: Record<string, unknown>
  profileError?: unknown
}) {
  const getUserById = vi.fn().mockResolvedValue({
    data: { user: params.user ?? null },
    error: params.authError ?? null,
  })
  const listUsers = vi.fn()
  const maybeSingle = vi.fn().mockResolvedValue({
    data: params.profile ?? null,
    error: params.profileError ?? null,
  })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return {
    admin: { auth: { admin: { getUserById, listUsers } }, from },
    getUserById,
    listUsers,
    from,
    eq,
  }
}

function validAuthInfo(): AuthInfo {
  return {
    token: "access-token",
    clientId: "sha256-client-id",
    scopes: ["erp.read"],
    extra: {
      email: "admin@example.com",
      role: "admin",
      sub: AUTHENTICATED_UUID,
      clientName: "ChatGPT",
      clientKind: "chatgpt",
      sessionId: "33333333-3333-4333-8333-333333333333",
    },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("identidad MCP actual", () => {
  it("autoriza únicamente el UUID autenticado exacto y nunca busca por email", async () => {
    const fixture = identityAdmin({
      user: {
        id: AUTHENTICATED_UUID,
        email: "same-email@example.com",
        banned_until: null,
        deleted_at: null,
      },
      profile: { rol: "admin" },
    })

    const identity = await resolveCurrentMcpIdentity(fixture.admin as never, AUTHENTICATED_UUID)

    expect(identity).toEqual({
      userId: AUTHENTICATED_UUID,
      email: "same-email@example.com",
      role: "admin",
    })
    expect(fixture.getUserById).toHaveBeenCalledWith(AUTHENTICATED_UUID)
    expect(fixture.eq).toHaveBeenCalledWith("id", AUTHENTICATED_UUID)
    expect(fixture.listUsers).not.toHaveBeenCalled()
  })

  it.each([
    ["baneo futuro", new Date(Date.now() + 60_000).toISOString()],
    ["baneo inválido", "not-a-valid-date"],
  ])("rechaza un usuario con %s", async (_label, bannedUntil) => {
    const fixture = identityAdmin({
      user: {
        id: AUTHENTICATED_UUID,
        email: "admin@example.com",
        banned_until: bannedUntil,
        deleted_at: null,
      },
      profile: { rol: "admin" },
    })

    await expect(resolveCurrentMcpIdentity(fixture.admin as never, AUTHENTICATED_UUID)).resolves.toBeNull()
    expect(fixture.from).not.toHaveBeenCalled()
  })
})

describe("auditoría MCP fail-closed", () => {
  it("devuelve challenge OAuth sin ejecutar ni auditar cuando falta authInfo", async () => {
    const previousOrigin = process.env.MCP_PUBLIC_ORIGIN
    process.env.MCP_PUBLIC_ORIGIN = "https://mcp.example.test/custom-path"
    const run = vi.fn()

    try {
      const result = await executeTool("estado_persona", { persona: "Ana" }, {}, run)
      const challenges = result._meta?.["mcp/www_authenticate"]

      expect(result.isError).toBe(true)
      expect(run).not.toHaveBeenCalled()
      expect(createAdminClientMock).not.toHaveBeenCalled()
      expect(challenges).toEqual([
        'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/api/mcp/mcp" error="invalid_token" error_description="OAuth access token required"',
      ])
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
    } finally {
      if (previousOrigin === undefined) delete process.env.MCP_PUBLIC_ORIGIN
      else process.env.MCP_PUBLIC_ORIGIN = previousOrigin
    }
  })

  it("lanza un error tipado cuando falta cliente o identidad", async () => {
    await expect(
      auditMcpToolCall({
        toolName: "estado_persona",
        args: {},
        status: "ok",
        durationMs: 1,
      })
    ).rejects.toMatchObject({
      name: "McpAuditError",
      code: "missing_context",
    })
    expect(createAdminClientMock).not.toHaveBeenCalled()
  })

  it("lanza un error tipado cuando falla el insert de auditoría", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: "42501" } })
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    })

    await expect(
      auditMcpToolCall({
        authInfo: validAuthInfo(),
        toolName: "estado_persona",
        args: { persona: "Ana" },
        status: "ok",
        durationMs: 4,
      })
    ).rejects.toMatchObject({
      name: "McpAuditError",
      code: "insert_failed",
    })
  })

  it("no devuelve el resultado de una herramienta si su auditoría falla", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: "audit_down" } })
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    })
    const run = vi.fn().mockResolvedValue({ confidential: "must-not-be-returned" })

    await expect(
      executeTool("estado_persona", { persona: "Ana" }, { authInfo: validAuthInfo() }, run)
    ).rejects.toMatchObject({
      name: "McpAuditError",
      code: "insert_failed",
    })
    expect(run).toHaveBeenCalledOnce()
    expect(insert).toHaveBeenCalledOnce()
  })
})

describe("descriptores de herramientas", () => {
  it("declara OAuth tanto en securitySchemes como en _meta", () => {
    const registerTool = vi.fn()
    registerErpTools({ registerTool } as unknown as McpServer)

    expect(registerTool).toHaveBeenCalledTimes(19)
    for (const [, descriptor] of registerTool.mock.calls) {
      expect(descriptor).toMatchObject({
        securitySchemes: [{ type: "oauth2", scopes: ["erp.read"] }],
        _meta: {
          securitySchemes: [{ type: "oauth2", scopes: ["erp.read"] }],
        },
      })
    }
  })
})
