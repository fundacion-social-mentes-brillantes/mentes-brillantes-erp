import { metadataCorsOptionsRequestHandler } from "mcp-handler"
import { protectedResourceMetadata } from "@/lib/mcp/metadata"
import { oauthNoStoreHeaders } from "@/lib/mcp/constants"

export const dynamic = "force-dynamic"

export function GET(req: Request) {
  return Response.json(protectedResourceMetadata(req), { headers: oauthNoStoreHeaders() })
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
