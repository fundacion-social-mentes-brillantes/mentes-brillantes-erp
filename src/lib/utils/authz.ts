import { createClient } from '@/lib/supabase/server'

export class AuthzError extends Error {}

export async function requireAdmin() {
  const supabase = await createClient()
  if (!supabase) throw new AuthzError('Supabase no configurado')

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw new AuthzError('No se pudo validar la sesión')
  if (!user) throw new AuthzError('No autenticado')

  const { data: perfil, error: perfilError } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (perfilError) throw new AuthzError('No se pudo verificar el rol')
  if (!perfil || perfil.rol !== 'admin') throw new AuthzError('Acceso denegado. Solo administradores.')

  return { supabase, user }
}
