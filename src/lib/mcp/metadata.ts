import { getMcpIssuer, getMcpResource, MCP_PRIMARY_SCOPE, MCP_SUPPORTED_SCOPES } from "./constants"

export function authorizationServerMetadata(req: Request) {
  const issuer = getMcpIssuer(req)
  return {
    issuer,
    authorization_endpoint: `${issuer}/api/mcp/oauth/authorize`,
    token_endpoint: `${issuer}/api/mcp/oauth/token`,
    registration_endpoint: `${issuer}/api/mcp/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...MCP_SUPPORTED_SCOPES],
  }
}

export function protectedResourceMetadata(req: Request) {
  return {
    resource: getMcpResource(req),
    authorization_servers: [getMcpIssuer(req)],
    bearer_methods_supported: ["header"],
    scopes_supported: [MCP_PRIMARY_SCOPE],
    resource_name: "Mentes Brillantes ERP — MCP financiero de solo lectura",
  }
}
