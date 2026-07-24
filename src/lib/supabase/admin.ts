import { createClient, type User } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return null
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

export type AdminUserLookup = {
  user: User | null
  error: string | null
}

/**
 * Consulta Auth Admin sin enviar una clave `sb_secret_*` como Bearer.
 *
 * Las claves secretas modernas son API keys opacas y deben viajar solo en
 * `apikey`. Las claves service_role heredadas sí son JWT y conservan el
 * encabezado Authorization para compatibilidad.
 */
export async function getAdminUserById(userId: string): Promise<AdminUserLookup> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return { user: null, error: 'not_configured' }

  try {
    const headers = new Headers({
      Accept: 'application/json',
      apikey: serviceKey,
    })
    if (!serviceKey.startsWith('sb_secret_')) {
      headers.set('Authorization', `Bearer ${serviceKey}`)
    }

    const response = await fetch(
      `${url.replace(/\/+$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        headers,
        cache: 'no-store',
      }
    )
    if (!response.ok) return { user: null, error: `http_${response.status}` }

    const user = (await response.json()) as User
    if (!user?.id || user.id !== userId) return { user: null, error: 'invalid_response' }
    return { user, error: null }
  } catch {
    return { user: null, error: 'request_failed' }
  }
}
