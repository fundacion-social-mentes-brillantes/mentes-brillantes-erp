import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const { createAdminClientMock, searchGlobalMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  searchGlobalMock: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}))

vi.mock("@/lib/telegram-cajero/tools", async () => {
  const actual = await vi.importActual<any>("@/lib/telegram-cajero/tools")
  return {
    ...actual,
    searchGlobal: searchGlobalMock,
  }
})

import { registerErpTools } from "../erp-tools"

const RAW_TOOLS_LIST_SCHEMA = z.object({
  tools: z.array(z.object({ name: z.string() }).passthrough()),
}).passthrough()

function validAuthInfo(): AuthInfo {
  return {
    token: "access-token",
    clientId: "sha256-client-id",
    scopes: ["erp.read"],
    extra: {
      role: "admin",
      sub: "11111111-1111-4111-8111-111111111111",
      clientName: "ChatGPT",
      clientKind: "chatgpt",
      sessionId: "33333333-3333-4333-8333-333333333333",
    },
  }
}

function configuredSupabase() {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const selectCalls: string[] = []
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: "sale-1",
      comprador_nombre: "CANARY BUYER NAME",
      concepto: "Taller",
      monto: 150000,
      fecha: "2026-07-24",
      estado: "activo",
    },
    error: null,
  })
  const client = {
    from(table: string) {
      if (table === "mcp_access_audit") return { insert }
      if (table === "ventas_externas") {
        return {
          select(columns: string) {
            selectCalls.push(columns)
            return {
              eq() {
                return { maybeSingle }
              },
            }
          },
        }
      }
      throw new Error(`Tabla inesperada en prueba: ${table}`)
    },
  }
  createAdminClientMock.mockReturnValue(client)
  return { insert, selectCalls }
}

async function connectedMcp() {
  const server = new McpServer({ name: "mcp-test", version: "1.0.0" })
  registerErpTools(server)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const send = clientTransport.send.bind(clientTransport)
  clientTransport.send = (message: any, options?: any) =>
    send(message, { ...options, authInfo: validAuthInfo() })
  const client = new Client({ name: "client-test", version: "1.0.0" })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return { client, server }
}

afterEach(() => {
  vi.clearAllMocks()
  delete process.env.MCP_PUBLIC_ORIGIN
})

describe("compatibilidad MCP real con ChatGPT", () => {
  it("conserva securitySchemes reales y publica outputSchema exacto para search/fetch", async () => {
    configuredSupabase()
    const { client, server } = await connectedMcp()
    try {
      const listed = await client.request(
        { method: "tools/list", params: {} },
        RAW_TOOLS_LIST_SCHEMA
      )

      expect(listed.tools).toHaveLength(22)
      for (const tool of listed.tools) {
        expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["erp.read"] }])
        expect(tool._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["erp.read"] }])
      }

      const search = listed.tools.find((tool) => tool.name === "search") as any
      expect(search.outputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
        required: ["results"],
        properties: {
          results: {
            type: "array",
            maxItems: 40,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "title", "text", "url"],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                text: { type: "string" },
                url: { type: "string", format: "uri" },
              },
            },
          },
        },
      })

      const fetch = listed.tools.find((tool) => tool.name === "fetch") as any
      expect(fetch.outputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "text", "url", "metadata"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          text: { type: "string" },
          url: { type: "string", format: "uri" },
          metadata: {
            type: "object",
            additionalProperties: false,
            required: ["category", "source", "readOnly"],
          },
        },
      })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it("search y fetch entregan el mismo objeto en content/structuredContent y URL sin PII", async () => {
    process.env.MCP_PUBLIC_ORIGIN = "https://erp.example.test"
    const { selectCalls } = configuredSupabase()
    searchGlobalMock.mockResolvedValue({
      toolName: "searchGlobal",
      status: "ok",
      queryScope: {},
      provenance: { sources: ["ventas_externas"], asOf: "2026-07-24T00:00:00Z" },
      resultCount: 1,
      data: {
        ventas_externas: [
          {
            id: "sale-1",
            comprador_nombre: "CANARY BUYER NAME",
            concepto: "Taller",
            monto: 150000,
          },
        ],
      },
      alerts: [],
      explanationHints: [],
      userSafeErrors: [],
      riskLevel: "low",
      requiresConfirmation: false,
    })
    const { client, server } = await connectedMcp()

    try {
      const searchResult = await client.callTool({
        name: "search",
        arguments: { query: "Taller" },
      })
      const searchText = JSON.parse((searchResult.content[0] as any).text)
      expect(searchText).toEqual(searchResult.structuredContent)
      const searchUrl = new URL((searchResult.structuredContent as any).results[0].url)
      expect(searchUrl.origin).toBe("https://erp.example.test")
      expect(searchUrl.searchParams.get("mcp_category")).toBe("ventas_externas")
      expect(searchUrl.searchParams.get("mcp_id")).toBe("sale-1")
      expect(searchUrl.toString()).not.toContain("CANARY")

      const fetchResult = await client.callTool({
        name: "fetch",
        arguments: { id: "ventas_externas:sale-1" },
      })
      const fetchText = JSON.parse((fetchResult.content[0] as any).text)
      expect(fetchText).toEqual(fetchResult.structuredContent)
      const fetchUrl = new URL((fetchResult.structuredContent as any).url)
      expect(fetchUrl.origin).toBe("https://erp.example.test")
      expect(fetchUrl.searchParams.get("mcp_id")).toBe("sale-1")
      expect(fetchUrl.toString()).not.toContain("CANARY")
      expect(selectCalls).toEqual([
        "id,comprador_nombre,concepto,monto,fecha,estado",
      ])
    } finally {
      await client.close()
      await server.close()
    }
  })
})
