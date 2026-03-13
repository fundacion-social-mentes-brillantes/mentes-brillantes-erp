'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ActionState = {
  error?: string;
  success?: boolean;
} | null;

export async function saveSocio(id: string | null, prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient()
  if (!supabase) return { error: 'Supabase no configurado' }

  const nombre = formData.get('nombre') as string
  const porcentajeStr = formData.get('porcentaje_participacion') as string
  const porcentaje = parseFloat(porcentajeStr)

  if (!nombre) return { error: 'El nombre es obligatorio' }
  if (isNaN(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    return { error: 'El porcentaje debe ser un número entre 0 y 100' }
  }

  const data = {
    nombre,
    porcentaje_participacion: porcentaje
  }

  if (id) {
    const { error } = await supabase.from('socios').update(data).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('socios').insert([data])
    if (error) return { error: error.message }
  }

  revalidatePath('/socios')
  redirect('/socios')
}

export async function toggleSocioEstado(id: string, activo: boolean) {
  const supabase = await createClient()
  if (!supabase) return
  await supabase.from('socios').update({ activo }).eq('id', id)
  revalidatePath('/socios')
}
