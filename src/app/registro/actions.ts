'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type RegistroState = {
  error?: string
  email?: string
  codigo?: string
  cedula?: string
} | null

export async function registroAction(prevState: RegistroState, formData: FormData): Promise<RegistroState> {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase() || ''
  const password = (formData.get('password') as string | null) || ''
  const confirm = (formData.get('confirm') as string | null) || ''
  const codigo = (formData.get('codigo') as string | null)?.trim() || ''
  const cedula = (formData.get('cedula') as string | null)?.trim() || ''

  if (!email || !password || !confirm || !codigo || !cedula) {
    return { error: 'Todos los campos son obligatorios.', email, codigo, cedula }
  }

  if (password.length < 8) {
    return { error: 'La contrase\u00f1a debe tener al menos 8 caracteres.', email, codigo, cedula }
  }

  if (password !== confirm) {
    return { error: 'Las contrase\u00f1as no coinciden.', email, codigo, cedula }
  }

  const admin = createAdminClient()
  if (!admin) {
    return { error: 'Configuraci\u00f3n de Supabase pendiente.', email, codigo, cedula }
  }

  // 1) Validar asistente por codigo y cedula
  const { data: asistente, error: asistenteError } = await admin
    .from('asistentes')
    .select('id, nombre, codigo, cedula')
    .eq('codigo', codigo)
    .eq('cedula', cedula)
    .maybeSingle()

  if (asistenteError || !asistente) {
    return { error: 'C\u00f3digo o c\u00e9dula inv\u00e1lidos.', email, codigo, cedula }
  }

  // 2) Verificar que no exista perfil previo con ese asistente
  const { data: perfilExistente, error: perfilError } = await admin
    .from('perfiles')
    .select('id')
    .eq('asistente_id', asistente.id)
    .maybeSingle()

  if (perfilError) {
    return { error: 'No se pudo validar el asistente. Int\u00e9ntalo de nuevo.', email, codigo, cedula }
  }

  if (perfilExistente) {
    return { error: 'Este consultante ya tiene una cuenta registrada.', email, codigo, cedula }
  }

  // 3) Crear usuario en Auth
  const { data: signUpData, error: signUpError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (signUpError || !signUpData?.user?.id) {
    const message = signUpError?.message || ''
    if (message.includes('already registered')) {
      return { error: 'Ya existe una cuenta con este correo.', email, codigo, cedula }
    }
    return { error: 'No se pudo crear la cuenta. Int\u00e9ntalo de nuevo.', email, codigo, cedula }
  }

  const userId = signUpData.user.id

  // 4) Crear perfil vinculado
  const { error: perfilInsertError } = await admin.from('perfiles').insert({
    id: userId,
    nombre: asistente.nombre,
    rol: 'consulta',
    asistente_id: asistente.id,
  })

  if (perfilInsertError) {
    // rollback del usuario auth
    await admin.auth.admin.deleteUser(userId)
    return { error: 'No se pudo completar el registro. Int\u00e9ntalo de nuevo.', email, codigo, cedula }
  }

  // 5) Iniciar sesi\u00f3n autom\u00e1ticamente
  const supabase = await createClient()
  if (!supabase) {
    return { error: 'Cuenta creada. Inicia sesi\u00f3n manualmente.', email, codigo, cedula }
  }

  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
  if (loginError) {
    return { error: 'Cuenta creada. Inicia sesi\u00f3n manualmente.', email, codigo, cedula }
  }

  revalidatePath('/', 'layout')
  redirect('/mi-estado')
}
