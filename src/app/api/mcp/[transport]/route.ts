import { createMcpHandler, withMcpAuth, metadataCorsOptionsRequestHandler } from "mcp-handler"
import { registerErpTools } from "@/lib/mcp/erp-tools"
import { verifyErpMcpToken } from "@/lib/mcp/auth"

// MCP financiero de Mentes Brillantes — SOLO LECTURA, remoto (no local).
// Endpoint Streamable HTTP: /api/mcp/mcp  (SSE deshabilitado; no requiere Redis).
export const dynamic = "force-dynamic"
export const maxDuration = 60

const baseHandler = createMcpHandler(
  (server) => {
    registerErpTools(server)
  },
  {
    serverInfo: { name: "mentes-brillantes-erp", version: "1.0.0" },
  },
  {
    basePath: "/api/mcp",
    disableSse: true,
    verboseLogs: false,
  }
)

// Exige un bearer token válido (validado contra el proveedor OAuth + lista blanca).
const handler = withMcpAuth(baseHandler, verifyErpMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
})

export { handler as GET, handler as POST, handler as DELETE }
export const OPTIONS = metadataCorsOptionsRequestHandler()
