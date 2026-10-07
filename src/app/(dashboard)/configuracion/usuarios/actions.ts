'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/utils/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { errorDeAccion } from '@/lib/utils/acciones'
import type { DbClient, Enums } from '@/lib/supabase/types'
import { Constants } from '@/types/database'

// Usuarios del ERP (solo admin). El rol vive en la tabla perfiles, que es lo
// unico en lo que confian las politicas de la base; NO se copia a
// user_metadata porque esos datos los puede cambiar el propio usuario.

export type UsuarioState = { error?: string; success?: boolean } | null

type Rol = Enums<'rol_usuario'>
const ROLES: readonly string[] = Constants.public.Enums.rol_usuario
const esRol = (valor: unknown): valor is Rol => typeof valor === 'string' && ROLES.includes(valor)

const textoDe = (formData: FormData, campo: string) => {
  const valor = formData.get(campo)
  return typeof valor === 'string' ? valor.trim() : ''
}

/** Un asistente solo puede estar vinculado a un usuario. */
async function asistenteYaVinculado(supabase: DbClient, asistenteId: string, excepto?: string) {
  const { data, error } = await supabase.from('perfiles').select('id').eq('asistente_id', asistenteId)
  if (error) throw new Error('No se pudo validar el asistente')
  return (data || []).some((perfil) => perfil.id !== excepto)
}

export async function actualizarUsuario(_prev: UsuarioState, formData: FormData): Promise<UsuarioState> {
  const id = textoDe(formData, 'id')
  const rol = textoDe(formData, 'rol')
  const asistenteId = textoDe(formData, 'asistente_id') || null
  if (!id || !rol) return { error: 'Datos incompletos' }
  if (!esRol(rol)) return { error: 'Rol no valido' }
  if (rol === 'consulta' && !asistenteId) return { error: 'Selecciona el asistente para rol consulta' }

  try {
    const { supabase, user } = await requireAdmin()

    const { data: actual, error: actualError } = await supabase.from('perfiles').select('id, rol').eq('id', id).single()
    if (actualError || !actual) return { error: 'No se encontró el usuario' }

    if (actual.rol === 'admin' && rol !== 'admin') {
      // Sin esto un admin podia quitarse el rol a si mismo o dejar el ERP sin
      // ningun administrador, y nadie podria volver a dar permisos.
      if (id === user.id) return { error: 'No puedes quitarte a ti mismo el rol de administrador.' }
      const { count, error: countError } = await supabase
        .from('perfiles')
        .select('id', { count: 'exact', head: true })
        .eq('rol', 'admin')
      if (countError) return { error: 'No se pudo validar cuantos administradores hay' }
      if ((count || 0) <= 1) return { error: 'Debe quedar al menos un administrador.' }
    }

    if (rol === 'consulta' && asistenteId && (await asistenteYaVinculado(supabase, asistenteId, id))) {
      return { error: 'Este asistente ya está vinculado a otro usuario' }
    }

    const { error } = await supabase
      .from('perfiles')
      .update({ rol, asistente_id: rol === 'consulta' ? asistenteId : null })
      .eq('id', id)
    if (error) return { error: error.message }
  } catch (e) {
    return errorDeAccion(e, 'No se pudo actualizar el usuario.', 'usuarios')
  }

  revalidatePath('/configuracion/usuarios')
  return { success: true }
}

export async function crearUsuario(_prev: UsuarioState, formData: FormData): Promise<UsuarioState> {
  const nombre = textoDe(formData, 'nombre')
  const email = textoDe(formData, 'email').toLowerCase()
  const password = (formData.get('password') as string | null) || ''
  const rol = textoDe(formData, 'rol')
  const asistenteId = textoDe(formData, 'asistente_id') || null

  if (!nombre || !email || !password || !rol) return { error: 'Datos incompletos' }
  if (!esRol(rol)) return { error: 'Rol no valido' }
  if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres' }
  if (rol === 'consulta' && !asistenteId) return { error: 'Selecciona el asistente para rol consulta' }

  try {
    const { supabase } = await requireAdmin()
    const admin = createAdminClient()
    if (!admin) return { error: 'Configuración de Supabase pendiente' }

    if (rol === 'consulta' && asistenteId && (await asistenteYaVinculado(supabase, asistenteId))) {
      return { error: 'Este asistente ya está vinculado a otro usuario' }
    }

    const { data: signUpData, error: signUpError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // Solo el nombre: el rol NO va aqui (ver arriba).
      user_metadata: { nombre },
    })

    if (signUpError || !signUpData?.user?.id) {
      const msg = signUpError?.message || ''
      if (msg.includes('already registered')) return { error: 'Ya existe un usuario con este correo' }
      return { error: 'No se pudo crear el usuario' }
    }

    const userId = signUpData.user.id
    const { error: perfilError } = await supabase.from('perfiles').insert({
      id: userId,
      nombre,
      rol,
      asistente_id: rol === 'consulta' ? asistenteId : null,
    })

    if (perfilError) {
      await admin.auth.admin.deleteUser(userId)
      return { error: 'No se pudo guardar el perfil; no se creó el usuario' }
    }
  } catch (e) {
    return errorDeAccion(e, 'No se pudo crear el usuario.', 'usuarios')
  }

  revalidatePath('/configuracion/usuarios')
  return { success: true }
}
