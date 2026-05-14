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

const REGISTRO_GENERIC_ERROR = 'No se pudo completar el registro. Verifica tus datos o solicita ayuda a la Fundación.'
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX_ATTEMPTS = 5
const registroAttempts = new Map<string, { count: number; firstAttemptAt: number }>()

function normalizeCredential(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function getRateLimitKey(email: string, codigo: string, cedula: string) {
  return `${normalizeCredential(email)}:${normalizeCredential(codigo)}:${normalizeCredential(cedula)}`
}

function isRateLimited(key: string) {
  const now = Date.now()
  const current = registroAttempts.get(key)
  if (!current || now - current.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    registroAttempts.set(key, { count: 1, firstAttemptAt: now })
    return false
  }
  if (current.count >= RATE_LIMIT_MAX_ATTEMPTS) return true
  current.count += 1
  return false
}

function clearRateLimit(key: string) {
  registroAttempts.delete(key)
}

export async function registroAction(prevState: RegistroState, formData: FormData): Promise<RegistroState> {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase() || ''
  const password = (formData.get('password') as string | null) || ''
  const confirm = (formData.get('confirm') as string | null) || ''
  const codigo = (formData.get('codigo') as string | null)?.trim() || ''
  const cedula = (formData.get('cedula') as string | null)?.trim() || ''
  const rateLimitKey = getRateLimitKey(email, codigo, cedula)

  if (!email || !password || !confirm || !codigo || !cedula) {
    return { error: 'Todos los campos son obligatorios.', email, codigo, cedula }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Ingresa un correo válido.', email, codigo, cedula }
  }

  if (!/^[a-zA-Z0-9-]{2,32}$/.test(codigo) || !/^[a-zA-Z0-9.-]{4,32}$/.test(cedula)) {
    return { error: REGISTRO_GENERIC_ERROR, email, codigo, cedula }
  }

  if (isRateLimited(rateLimitKey)) {
    return { error: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.', email, codigo, cedula }
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

  clearRateLimit(rateLimitKey)

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
