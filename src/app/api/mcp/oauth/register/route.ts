import { issueClientId } from "@/lib/mcp/oauth"

// Dynamic Client Registration (RFC 7591). Claude se registra solo. El client_id
// es un JWT firmado que lleva dentro los redirect_uris permitidos (sin BD).
export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any))
  const redirectUris: string[] = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u: unknown) => typeof u === "string")
    : []

  if (!redirectUris.length) {
    return Response.json({ error: "invalid_redirect_uri", error_description: "Se requieren redirect_uris." }, { status: 400, headers: CORS })
  }

  const clientId = await issueClientId(redirectUris, typeof body.client_name === "string" ? body.client_name : undefined)

  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: typeof body.client_name === "string" ? body.client_name : "mcp-client",
    },
    { status: 201, headers: CORS }
  )
}
