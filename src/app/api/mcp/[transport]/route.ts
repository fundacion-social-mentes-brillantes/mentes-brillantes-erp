import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { registerErpTools } from "@/lib/mcp/erp-tools"
import { registerEscrituraTools } from "@/lib/mcp/escritura-tools"
import { verifyErpMcpToken } from "@/lib/mcp/auth"
import { MCP_PRIMARY_SCOPE } from "@/lib/mcp/constants"

// MCP financiero de Mentes Brillantes, remoto (no local).
// Endpoint Streamable HTTP: /api/mcp/mcp  (SSE deshabilitado; no requiere Redis).
// Consultas de solo lectura + escritura en dos pasos (borrador -> confirmacion).
export const dynamic = "force-dynamic"
export const maxDuration = 60

const baseHandler = createMcpHandler(
  (server) => {
    registerErpTools(server)
    registerEscrituraTools(server)
  },
  {
    serverInfo: { name: "mentes-brillantes-erp", version: "2.1.0" },
    instructions:
      "MCP financiero de Mentes Brillantes. Las herramientas de consulta son de solo lectura: respeta status, provenance, userSafeErrors y cualquier marca truncated/partial antes de afirmar cifras. " +
      "Para registrar movimientos hay dos pasos obligatorios: primero preparar_* (no escribe nada, devuelve un borrador con el detalle y un confirmacion_id) y despues confirmar_operacion, que SI escribe. " +
      "Nunca llames a confirmar_operacion sin haberle mostrado antes el borrador al usuario y recibido su aprobacion explicita en ese mismo turno; si duda o corrige algo, usa cancelar_operacion y prepara uno nuevo. " +
      "No solicites ni reveles cédulas, notas coach, contraseñas o tokens.",
  },
  {
    basePath: "/api/mcp",
    disableSse: true,
    verboseLogs: false,
  }
)

// Exige un bearer token válido (validado contra el proveedor OAuth + lista blanca).
const optionalAuthHandler = withMcpAuth(baseHandler, verifyErpMcpToken, {
  required: false,
  requiredScopes: [MCP_PRIMARY_SCOPE],
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp/mcp",
})

const requiredAuthHandler = withMcpAuth(baseHandler, verifyErpMcpToken, {
  required: true,
  requiredScopes: [MCP_PRIMARY_SCOPE],
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp/mcp",
})

function originAllowed(req: Request): boolean {
  const value = req.headers.get("origin")
  if (!value) return true
  try {
    const origin = new URL(value)
    const requestOrigin = new URL(req.url).origin
    const configured = new Set(
      String(process.env.MCP_ALLOWED_ORIGINS || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
    return (
      origin.origin === requestOrigin ||
      origin.origin === "https://claude.ai" ||
      origin.origin === "https://claude.com" ||
      origin.origin === "https://chatgpt.com" ||
      origin.origin === "https://chat.openai.com" ||
      configured.has(origin.origin)
    )
  } catch {
    return false
  }
}

function withCors(req: Request, response: Response): Response {
  const origin = req.headers.get("origin")
  if (!origin) return response
  const headers = new Headers(response.headers)
  headers.set("Access-Control-Allow-Origin", new URL(origin).origin)
  headers.append("Vary", "Origin")
  headers.set("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate")
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function guardedHandler(req: Request) {
  if (!originAllowed(req)) {
    return Response.json({ error: "forbidden_origin" }, { status: 403, headers: { "Cache-Control": "no-store" } })
  }
  // POST sin token permite initialize/tools/list. Cada tools/call se protege
  // centralmente y devuelve el challenge MCP que activa OAuth en ChatGPT.
  // GET/DELETE siguen exigiendo bearer para no abrir sesiones o streams.
  const selectedHandler = req.method === "POST" ? optionalAuthHandler : requiredAuthHandler
  return withCors(req, await selectedHandler(req))
}

export function OPTIONS(req: Request) {
  if (!originAllowed(req)) {
    return Response.json({ error: "forbidden_origin" }, { status: 403, headers: { "Cache-Control": "no-store" } })
  }
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
  })
  const origin = req.headers.get("origin")
  if (origin) {
    headers.set("Access-Control-Allow-Origin", new URL(origin).origin)
    headers.set("Vary", "Origin")
  }
  return new Response(null, { status: 204, headers })
}

export { guardedHandler as GET, guardedHandler as POST, guardedHandler as DELETE }
