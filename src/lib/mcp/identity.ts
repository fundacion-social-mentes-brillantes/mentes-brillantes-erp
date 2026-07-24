import type { User } from "@supabase/supabase-js"
import { getAdminUserById } from "@/lib/supabase/admin"
import type { ErpRole } from "./oauth"

type AdminClient = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>

export type McpIdentity = {
  userId: string
  email: string
  role: Exclude<ErpRole, "consulta">
}

function activeUser(user: User, expectedUserId: string): boolean {
  if (user.id !== expectedUserId || user.deleted_at) return false

  const bannedUntil = String(user.banned_until || "").trim()
  if (!bannedUntil) return true

  const bannedUntilMs = Date.parse(bannedUntil)
  return Number.isFinite(bannedUntilMs) && bannedUntilMs <= Date.now()
}

export async function resolveCurrentMcpIdentity(
  admin: NonNullable<AdminClient>,
  authenticatedUserId: string
): Promise<McpIdentity | null> {
  if (!authenticatedUserId) return null

  try {
    const { user, error: authError } = await getAdminUserById(authenticatedUserId)
    if (authError || !user || !activeUser(user, authenticatedUserId)) return null

    const { data: profile, error: profileError } = await admin
      .from("perfiles")
      .select("rol")
      .eq("id", authenticatedUserId)
      .maybeSingle()
    if (profileError || (profile?.rol !== "admin" && profile?.rol !== "caja")) return null

    return {
      userId: authenticatedUserId,
      email: user.email || "",
      role: profile.rol,
    }
  } catch {
    return null
  }
}

export async function resolveMcpIdentity(
  admin: NonNullable<AdminClient>,
  user: Pick<User, "id">
): Promise<McpIdentity | null> {
  return resolveCurrentMcpIdentity(admin, user.id)
}
