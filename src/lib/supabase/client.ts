import { createBrowserClient } from '@supabase/ssr'
import { hasEnvVars } from '../env'
import type { Database } from '@/types/database'

export function createClient() {
  if (!hasEnvVars()) {
    return null;
  }
  
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        sameSite: 'none',
        secure: true,
      }
    }
  )
}
