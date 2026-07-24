import type { User } from "@supabase/supabase-js"
import type { ErpRole } from "./oauth"

type AdminClient = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>

export type McpIdentity = {
  userId: string
  email: string
  role: Exclude<ErpRole, "consulta">
}

export async function resolveCurrentMcpIdentity(
  admin: NonNullable<AdminClient>,
  authenticatedUserId: string
): Promise<McpIdentity | null> {
  if (!authenticatedUserId) return null

  try {
    const { data, error } = await admin
      .rpc("mcp_resolve_identity", { p_user_id: authenticatedUserId })
      .maybeSingle()
    const identity = data as { user_id?: string; email?: string; role?: string } | null
    if (
      error ||
      identity?.user_id !== authenticatedUserId ||
      (identity.role !== "admin" && identity.role !== "caja")
    ) {
      return null
    }

    return {
      userId: authenticatedUserId,
      email: identity.email || "",
      role: identity.role,
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
