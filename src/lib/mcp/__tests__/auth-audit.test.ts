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
  identity?: Record<string, unknown>
  error?: unknown
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: params.identity ?? null,
    error: params.error ?? null,
  })
  const rpc = vi.fn().mockReturnValue({ maybeSingle })
  return {
    admin: { rpc },
    rpc,
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
      identity: {
        user_id: AUTHENTICATED_UUID,
        email: "same-email@example.com",
        role: "admin",
      },
    })

    const identity = await resolveCurrentMcpIdentity(fixture.admin as never, AUTHENTICATED_UUID)

    expect(identity).toEqual({
      userId: AUTHENTICATED_UUID,
      email: "same-email@example.com",
      role: "admin",
    })
    expect(fixture.rpc).toHaveBeenCalledWith("mcp_resolve_identity", {
      p_user_id: AUTHENTICATED_UUID,
    })
  })

  it("rechaza cuando la función protegida no devuelve una identidad activa y autorizada", async () => {
    const fixture = identityAdmin({})

    await expect(resolveCurrentMcpIdentity(fixture.admin as never, AUTHENTICATED_UUID)).resolves.toBeNull()
    expect(fixture.rpc).toHaveBeenCalledOnce()
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

    // Fail-closed: nunca entrega los datos, pero responde con un error limpio
    // (no una excepción cruda) y reintenta una vez por si el fallo es pasajero.
    const response = await executeTool(
      "estado_persona",
      { persona: "Ana" },
      { authInfo: validAuthInfo() },
      run
    )

    expect(response.isError).toBe(true)
    expect(JSON.stringify(response)).not.toContain("must-not-be-returned")
    expect(response.content[0].text).toContain("auditoría")
    expect(run).toHaveBeenCalledOnce()
    expect(insert).toHaveBeenCalledTimes(2)
  })

  it("entrega el resultado si la auditoría se recupera en el reintento", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "transitorio" } })
      .mockResolvedValueOnce({ error: null })
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    })
    const run = vi.fn().mockResolvedValue({ dato: 42 })

    const response = await executeTool(
      "estado_persona",
      { persona: "Ana" },
      { authInfo: validAuthInfo() },
      run
    )

    expect(response.isError).toBeUndefined()
    expect(response.content[0].text).toContain("42")
    expect(insert).toHaveBeenCalledTimes(2)
  })

  it("no reintenta cuando el contexto autenticado es inválido", async () => {
    const insert = vi.fn()
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    })
    const run = vi.fn().mockResolvedValue({ dato: 1 })

    const response = await executeTool(
      "estado_persona",
      { persona: "Ana" },
      { authInfo: { ...validAuthInfo(), extra: { ...validAuthInfo().extra, role: "consulta" } } },
      run
    )

    expect(response.isError).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  })
})

describe("descriptores de herramientas", () => {
  it("declara OAuth tanto en securitySchemes como en _meta", () => {
    const registerTool = vi.fn()
    registerErpTools({ registerTool } as unknown as McpServer)

    expect(registerTool).toHaveBeenCalledTimes(22)
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
