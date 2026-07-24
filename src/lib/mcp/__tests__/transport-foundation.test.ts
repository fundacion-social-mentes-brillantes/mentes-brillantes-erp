import { describe, expect, it } from "vitest"
import { OPTIONS } from "@/app/api/mcp/[transport]/route"

const ENDPOINT = "https://mentes-brillantes-erp.vercel.app/api/mcp/mcp"

describe("transporte MCP remoto", () => {
  it.each(["https://claude.ai", "https://claude.com", "https://chatgpt.com"])(
    "autoriza preflight completo desde %s",
    (origin) => {
      const response = OPTIONS(
        new Request(ENDPOINT, {
          method: "OPTIONS",
          headers: {
            origin,
            "access-control-request-method": "POST",
            "access-control-request-headers": "authorization,content-type,mcp-protocol-version",
          },
        })
      )

      expect(response.status).toBe(204)
      expect(response.headers.get("access-control-allow-origin")).toBe(origin)
      expect(response.headers.get("access-control-allow-methods")).toContain("POST")
      expect(response.headers.get("access-control-allow-methods")).toContain("DELETE")
      expect(response.headers.get("access-control-allow-headers")).toContain("Authorization")
      expect(response.headers.get("cache-control")).toContain("no-store")
    }
  )

  it("rechaza un origen web no permitido", async () => {
    const response = OPTIONS(
      new Request(ENDPOINT, {
        method: "OPTIONS",
        headers: { origin: "https://attacker.example" },
      })
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: "forbidden_origin" })
  })
})
