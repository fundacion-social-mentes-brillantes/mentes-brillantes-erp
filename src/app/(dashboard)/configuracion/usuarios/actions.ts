'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/utils/authz'

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
