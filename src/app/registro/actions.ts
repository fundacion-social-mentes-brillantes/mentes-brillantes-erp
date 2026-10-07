'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { ipDeEncabezados, limpiarIntentos, registrarIntentoYExcede } from '@/lib/seguridad/limite-intentos'

export type RegistroState = {
  error?: string
  email?: string
  codigo?: string
  cedula?: string
} | null

const REGISTRO_GENERIC_ERROR = 'No se pudo completar el registro. Verifica tus datos o solicita ayuda a la Fundación.'
function normalizeCredential(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

export async function registroAction(prevState: RegistroState, formData: FormData): Promise<RegistroState> {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase() || ''
  const password = (formData.get('password') as string | null) || ''
  const confirm = (formData.get('confirm') as string | null) || ''
  const codigo = (formData.get('codigo') as string | null)?.trim() || ''
  const cedula = (formData.get('cedula') as string | null)?.trim() || ''

  if (!email || !password || !confirm || !codigo || !cedula) {
    return { error: 'Todos los campos son obligatorios.', email, codigo, cedula }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Ingresa un correo válido.', email, codigo, cedula }
  }

  if (!/^[a-zA-Z0-9-]{2,32}$/.test(codigo) || !/^[a-zA-Z0-9.-]{4,32}$/.test(cedula)) {
    return { error: REGISTRO_GENERIC_ERROR, email, codigo, cedula }
  }

  // El limite cuenta por codigo de persona y por IP: cambiar el correo ya no
  // reinicia la cuenta (antes la clave incluia el correo).
  const admin = createAdminClient()
  const claveCodigo = `codigo:${normalizeCredential(codigo)}`
  const ip = ipDeEncabezados(await headers())
  // 5 intentos por persona; 30 por IP (en la fundacion se registran varios desde el mismo wifi).
  const excede = await registrarIntentoYExcede(admin, [
    { clave: claveCodigo, maximo: 5 },
    { clave: ip ? `ip:${ip}` : '', maximo: 30 },
  ])
  if (excede) {
    return { error: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.', email, codigo, cedula }
  }

  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.', email, codigo, cedula }
  }

  if (password !== confirm) {
    return { error: 'Las contraseñas no coinciden.', email, codigo, cedula }
  }

  if (!admin) {
    return { error: 'Configuración de Supabase pendiente.', email, codigo, cedula }
  }

  // 1) Validar asistente por codigo y cedula
  const { data: asistente, error: asistenteError } = await admin
    .from('asistentes')
    .select('id, nombre, codigo, cedula')
    .eq('codigo', codigo)
    .eq('cedula', cedula)
    .maybeSingle()

  if (asistenteError || !asistente) {
    return { error: REGISTRO_GENERIC_ERROR, email, codigo, cedula }
  }

  // 2) Verificar que no exista perfil previo con ese asistente
  const { data: perfilExistente, error: perfilError } = await admin
    .from('perfiles')
    .select('id')
    .eq('asistente_id', asistente.id)
    .maybeSingle()

  if (perfilError) {
    return { error: REGISTRO_GENERIC_ERROR, email, codigo, cedula }
  }

  if (perfilExistente) {
    return { error: REGISTRO_GENERIC_ERROR, email, codigo, cedula }
  }

  // 3) Crear usuario en Auth
  const { data: signUpData, error: signUpError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (signUpError || !signUpData?.user?.id) {
    return { error: REGISTRO_GENERIC_ERROR, email, codigo, cedula }
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
    return { error: REGISTRO_GENERIC_ERROR, email, codigo, cedula }
  }

  await limpiarIntentos(admin, [claveCodigo])

  // 5) Iniciar sesión automáticamente
  const supabase = await createClient()
  if (!supabase) {
    return { error: 'Cuenta creada. Inicia sesión manualmente.', email, codigo, cedula }
  }

  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
  if (loginError) {
    return { error: 'Cuenta creada. Inicia sesión manualmente.', email, codigo, cedula }
  }

  revalidatePath('/', 'layout')
  redirect('/mi-estado')
}
