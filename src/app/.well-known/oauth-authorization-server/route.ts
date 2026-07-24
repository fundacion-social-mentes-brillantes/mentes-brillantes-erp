import { getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler"

// Metadata del Authorization Server (RFC 8414). Claude la usa para saber a qué
// endpoints hablar. El ERP mismo es el AS (login con cuenta Supabase + PKCE).
export const dynamic = "force-dynamic"

export function GET(req: Request) {
  const origin = getPublicOrigin(req)
  return Response.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["erp.read"],
  })
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
