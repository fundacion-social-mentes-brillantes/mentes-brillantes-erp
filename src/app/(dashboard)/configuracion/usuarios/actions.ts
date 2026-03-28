'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/utils/authz'
import { createAdminClient } from '@/lib/supabase/admin'

export type UsuarioState = { error?: string; success?: boolean } | null

export async function actualizarUsuario(prev: UsuarioState, formData: FormData): Promise<UsuarioState> {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const id = formData.get('id') as string
  const rol = (formData.get('rol') as string) as 'admin' | 'caja' | 'consulta'
  const asistente_id_raw = formData.get('asistente_id') as string | null
  if (!id || !rol) return { error: 'Datos incompletos' }

  const updatePayload: any = { rol }
  if (rol === 'consulta') {
    updatePayload.asistente_id = asistente_id_raw || null
  } else {
    updatePayload.asistente_id = null
  }

  const { error } = await supabase.from('perfiles').update(updatePayload).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/configuracion/usuarios')
  return { success: true }
}

export async function crearUsuario(prev: UsuarioState, formData: FormData): Promise<UsuarioState> {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const admin = createAdminClient()
  if (!admin) {
    return { error: 'Configuración de Supabase pendiente' }
  }

  const nombre = (formData.get('nombre') as string | null)?.trim() || ''
  const email = (formData.get('email') as string | null)?.trim().toLowerCase() || ''
  const password = (formData.get('password') as string | null) || ''
  const rol = (formData.get('rol') as string | null) as 'admin' | 'caja' | 'consulta' | null
  const asistente_id = (formData.get('asistente_id') as string | null) || null

  if (!nombre || !email || !password || !rol) {
    return { error: 'Datos incompletos' }
  }
  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres' }
  }
  if (rol === 'consulta' && !asistente_id) {
    return { error: 'Selecciona el asistente para rol consulta' }
  }
  if (rol !== 'consulta') {
    // no debe llevar asistente
  }

  // Si es consulta, validar que el asistente no tenga perfil previo
  if (rol === 'consulta' && asistente_id) {
    const { data: existente, error: existeError } = await supabase
      .from('perfiles')
      .select('id')
      .eq('asistente_id', asistente_id)
      .maybeSingle()

    if (existeError) return { error: 'No se pudo validar el asistente' }
    if (existente) return { error: 'Este asistente ya está vinculado a otro usuario' }
  }

  // Crear usuario en Auth
  const { data: signUpData, error: signUpError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, rol },
  })

  if (signUpError || !signUpData?.user?.id) {
    const msg = signUpError?.message || ''
    if (msg.includes('already registered')) return { error: 'Ya existe un usuario con este correo' }
    return { error: 'No se pudo crear el usuario' }
  }

  const userId = signUpData.user.id

  // Crear perfil
  const { error: perfilError } = await supabase.from('perfiles').insert({
    id: userId,
    nombre,
    rol,
    asistente_id: rol === 'consulta' ? asistente_id : null,
  })

  if (perfilError) {
    await admin.auth.admin.deleteUser(userId)
    return { error: 'No se pudo guardar el perfil; no se creó el usuario' }
  }

  revalidatePath('/configuracion/usuarios')
  return { success: true }
}
