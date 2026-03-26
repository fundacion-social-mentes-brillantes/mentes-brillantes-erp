import { createClient } from '../supabase/server'

export type Role = 'admin' | 'caja' | 'consulta'

export class AuthzError extends Error {}

type Profile = {
  id: string
  nombre: string
  rol: Role
  asistente_id: string | null
}

export async function getCurrentProfile() {
  const supabase = await createClient()
  if (!supabase) throw new AuthzError('Supabase no configurado')

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) throw new AuthzError('No se pudo validar la sesión')
  if (!user) throw new AuthzError('No autenticado')

  const { data: perfil, error: perfilError } = await supabase
    .from('perfiles')
    .select('id, nombre, rol, asistente_id')
    .eq('id', user.id)
    .single()

  if (perfilError) throw new AuthzError('No se pudo verificar el rol')
  if (!perfil) throw new AuthzError('Perfil no encontrado')

  return { supabase, user, perfil: perfil as Profile }
}

export async function requireRoles(roles: Role[]) {
  const { supabase, user, perfil } = await getCurrentProfile()
  if (!roles.includes(perfil.rol)) {
    throw new AuthzError('Acceso denegado')
  }
  return { supabase, user, perfil }
}

export async function requireConsultaOwner(asistenteId: string) {
  const { supabase, user, perfil } = await getCurrentProfile()
  if (perfil.rol !== 'consulta') throw new AuthzError('Acceso denegado')
  if (!perfil.asistente_id || perfil.asistente_id !== asistenteId) {
    throw new AuthzError('Acceso restringido al titular')
  }
  return { supabase, user, perfil }
}

export async function requireAdmin() {
  return requireRoles(['admin'])
}
