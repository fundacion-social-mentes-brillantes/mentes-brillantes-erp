import { getMcpIssuer, getMcpResource, normalizeRequestedScopes } from "./constants"
import { readClientId, redirectUriAllowed, type RegisteredMcpClient } from "./oauth"

export type OauthParams = {
  client_id: string
  redirect_uri: string
  response_type: string
  code_challenge: string
  code_challenge_method: string
  state: string
  scope: string
  resource: string
}

export type ValidAuthorizationRequest = {
  params: OauthParams
  client: RegisteredMcpClient
  scopes: string[]
  resource: string
  issuer: string
}

export function readOauthParams(get: (key: string) => string | null): OauthParams {
  return {
    client_id: get("client_id") || "",
    redirect_uri: get("redirect_uri") || "",
    response_type: get("response_type") || "",
    code_challenge: get("code_challenge") || "",
    code_challenge_method: get("code_challenge_method") || "",
    state: get("state") || "",
    scope: get("scope") || "",
    resource: get("resource") || "",
  }
}

export async function validateAuthorizationRequest(
  req: Request,
  params: OauthParams
): Promise<{ ok: true; value: ValidAuthorizationRequest } | { ok: false; error: string }> {
  if (Object.values(params).some((value) => value.length > 4096)) {
    return { ok: false, error: "La solicitud es demasiado grande." }
  }
  if (!params.client_id) return { ok: false, error: "Falta client_id." }
  const client = await readClientId(params.client_id)
  if (!client) return { ok: false, error: "client_id inválido o vencido." }
  if (!params.redirect_uri || !redirectUriAllowed(params.redirect_uri, client.redirect_uris)) {
    return { ok: false, error: "redirect_uri no permitido." }
  }
  if (params.response_type !== "code") return { ok: false, error: "response_type debe ser 'code'." }
  if (!/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge) || params.code_challenge_method !== "S256") {
    return { ok: false, error: "Se requiere PKCE S256 válido." }
  }
  const resource = getMcpResource(req)
  if (params.resource !== resource) return { ok: false, error: "resource no coincide con el endpoint MCP." }
  const scopes = normalizeRequestedScopes(params.scope)
  if (!scopes) return { ok: false, error: "scope no permitido." }
  return {
    ok: true,
    value: { params, client, scopes, resource, issuer: getMcpIssuer(req) },
  }
}
