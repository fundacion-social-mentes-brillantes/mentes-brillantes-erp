import { issueClientId, OAUTH_TTL, validateRedirectUris } from "@/lib/mcp/oauth"
import { MCP_SUPPORTED_SCOPES, oauthNoStoreHeaders } from "@/lib/mcp/constants"

// Dynamic Client Registration (RFC 7591). Claude se registra solo. El client_id
// es un JWT firmado que lleva dentro los redirect_uris permitidos (sin BD).
export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  ...oauthNoStoreHeaders(),
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  const declaredLength = Number(req.headers.get("content-length") || "0")
  if (declaredLength > 16_384) {
    return Response.json({ error: "invalid_client_metadata", error_description: "Solicitud demasiado grande." }, { status: 413, headers: CORS })
  }
  const raw = await req.text()
  if (raw.length > 16_384) {
    return Response.json({ error: "invalid_client_metadata", error_description: "Solicitud demasiado grande." }, { status: 413, headers: CORS })
  }
  const body = (() => {
    try {
      return JSON.parse(raw || "{}") as Record<string, unknown>
    } catch {
      return {}
    }
  })()
  const redirectUris = validateRedirectUris(body.redirect_uris)

  if (!redirectUris) {
    return Response.json(
      {
        error: "invalid_redirect_uri",
        error_description: "Solo se aceptan callbacks oficiales de Claude/ChatGPT o loopback local para Claude Code.",
      },
      { status: 400, headers: CORS }
    )
  }

  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") {
    return Response.json(
      { error: "invalid_client_metadata", error_description: "Este servidor admite clientes públicos con token_endpoint_auth_method=none." },
      { status: 400, headers: CORS }
    )
  }

  const clientName = typeof body.client_name === "string" ? body.client_name : "Cliente MCP"
  const clientId = await issueClientId(redirectUris, clientName)
  const issuedAt = Math.floor(Date.now() / 1000)

  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: issuedAt,
      client_id_expires_at: issuedAt + OAUTH_TTL.CLIENT_TTL,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: clientName.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) || "Cliente MCP",
      scope: MCP_SUPPORTED_SCOPES.join(" "),
    },
    { status: 201, headers: CORS }
  )
}
