import { createHash, randomBytes, randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import type { ErpRole } from "./oauth"

const TABLE = "mcp_oauth_artifacts"

export type StoredRefreshGrant = {
  user_id: string
  email: string
  role: ErpRole
  client_id_hash: string
  client_name: string
  resource: string
  scope: string
  family_id: string
  expires_at: string
  consumed_at: string | null
  revoked_at: string | null
}

function admin() {
  const client = createAdminClient()
  if (!client) throw new Error("Supabase service role no configurado")
  return client
}

export function hashOAuthValue(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function randomOpaqueToken(): string {
  return randomBytes(32).toString("base64url")
}

export function newTokenFamilyId(): string {
  return randomUUID()
}

export async function rememberAuthorizationCode(params: {
  code: string
  userId: string
  clientId: string
  resource: string
  expiresAt: Date
}) {
  const { error } = await admin().from(TABLE).insert({
    token_hash: hashOAuthValue(params.code),
    token_type: "authorization_code",
    user_id: params.userId,
    client_id_hash: hashOAuthValue(params.clientId),
    resource: params.resource,
    expires_at: params.expiresAt.toISOString(),
  })
  if (error) throw new Error(`No se pudo guardar el código OAuth: ${error.code || "db_error"}`)
}

export async function redeemAuthorizationCodeOnce(code: string): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await admin()
    .from(TABLE)
    .update({ consumed_at: now })
    .eq("token_hash", hashOAuthValue(code))
    .eq("token_type", "authorization_code")
    .is("consumed_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select("id")
    .maybeSingle()

  if (error) throw new Error(`No se pudo consumir el código OAuth: ${error.code || "db_error"}`)
  return Boolean(data)
}

export async function rememberRefreshToken(params: {
  token: string
  userId: string
  email: string
  role: ErpRole
  clientId: string
  clientName: string
  resource: string
  scopes: string[]
  familyId: string
  expiresAt: Date
}) {
  const { error } = await admin().from(TABLE).insert({
    token_hash: hashOAuthValue(params.token),
    token_type: "refresh_token",
    user_id: params.userId,
    email: params.email,
    role: params.role,
    client_id_hash: hashOAuthValue(params.clientId),
    client_name: params.clientName,
    resource: params.resource,
    scope: params.scopes.join(" "),
    family_id: params.familyId,
    expires_at: params.expiresAt.toISOString(),
  })
  if (error) throw new Error(`No se pudo guardar el refresh token: ${error.code || "db_error"}`)
}

export async function consumeRefreshToken(token: string): Promise<StoredRefreshGrant | null> {
  const tokenHash = hashOAuthValue(token)
  const now = new Date().toISOString()
  const client = admin()
  const { data, error } = await client
    .from(TABLE)
    .update({ consumed_at: now })
    .eq("token_hash", tokenHash)
    .eq("token_type", "refresh_token")
    .is("consumed_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select("user_id,email,role,client_id_hash,client_name,resource,scope,family_id,expires_at,consumed_at,revoked_at")
    .maybeSingle()

  if (error) throw new Error(`No se pudo consumir el refresh token: ${error.code || "db_error"}`)
  if (data) return data as StoredRefreshGrant

  // Si un refresh ya consumido vuelve a aparecer, se considera robo/replay y
  // se revoca toda su familia, incluidos los access tokens aún vigentes.
  const { data: prior, error: priorError } = await client
    .from(TABLE)
    .select("family_id,consumed_at")
    .eq("token_hash", tokenHash)
    .eq("token_type", "refresh_token")
    .maybeSingle()

  if (priorError) throw new Error(`No se pudo verificar el refresh token: ${priorError.code || "db_error"}`)
  if (prior?.family_id && prior?.consumed_at) await revokeTokenFamily(String(prior.family_id))
  return null
}

export async function revokeTokenFamily(familyId: string): Promise<void> {
  const { error } = await admin()
    .from(TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq("family_id", familyId)
    .is("revoked_at", null)
  if (error) throw new Error(`No se pudo revocar la sesión OAuth: ${error.code || "db_error"}`)
}

export async function isTokenFamilyRevoked(familyId: string): Promise<boolean> {
  const { data, error } = await admin()
    .from(TABLE)
    .select("id")
    .eq("family_id", familyId)
    .not("revoked_at", "is", null)
    .limit(1)

  if (error) throw new Error(`No se pudo verificar la sesión OAuth: ${error.code || "db_error"}`)
  return Boolean(data?.length)
}
