import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  if (supabase) {
    await supabase.auth.signOut()
  }
  redirect('/login')
}
