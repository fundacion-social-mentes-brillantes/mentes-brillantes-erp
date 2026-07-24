import { metadataCorsOptionsRequestHandler } from "mcp-handler"
import { authorizationServerMetadata } from "@/lib/mcp/metadata"
import { oauthNoStoreHeaders } from "@/lib/mcp/constants"

// Metadata del Authorization Server (RFC 8414). Claude la usa para saber a qué
// endpoints hablar. El ERP mismo es el AS (login con cuenta Supabase + PKCE).
export const dynamic = "force-dynamic"

export function GET(req: Request) {
  return Response.json(authorizationServerMetadata(req), { headers: oauthNoStoreHeaders() })
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
