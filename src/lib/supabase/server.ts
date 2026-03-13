import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { hasEnvVars } from '../env'

export async function createClient() {
  if (!hasEnvVars()) {
    return null;
  }

  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const cookieOptions = {
                ...options,
                sameSite: 'none' as const,
                secure: true,
              }
              cookieStore.set(name, value, cookieOptions)
            })
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
