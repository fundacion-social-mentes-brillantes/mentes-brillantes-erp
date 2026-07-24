import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler"

// Metadata OAuth 2.0 (RFC 9728): le dice a Claude cuál es el Authorization
// Server (Microsoft Entra ID o Google) que debe usar para autenticarse.
export const dynamic = "force-dynamic"

const issuer = process.env.MCP_OAUTH_ISSUER?.replace(/\/+$/, "")

export const GET = protectedResourceHandler({
  authServerUrls: issuer ? [issuer] : [],
})

export const OPTIONS = metadataCorsOptionsRequestHandler()
