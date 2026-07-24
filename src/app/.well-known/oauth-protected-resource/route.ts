import { generateProtectedResourceMetadata, getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler"

// Metadata OAuth 2.0 (RFC 9728): apunta a NUESTRO propio Authorization Server
// (el mismo ERP), que autentica con la cuenta de Supabase del usuario.
export const dynamic = "force-dynamic"

export function GET(req: Request) {
  const origin = getPublicOrigin(req)
  return Response.json(generateProtectedResourceMetadata({ authServerUrls: [origin], resourceUrl: origin }))
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
