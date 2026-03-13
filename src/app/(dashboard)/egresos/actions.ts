'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ActionState = {
  error?: string;
  success?: boolean;
} | null;

export async function saveEgreso(id: string | null, prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient()
  if (!supabase) return { error: 'Supabase no configurado' }

  const concepto = formData.get('concepto') as string
  const monto_str = formData.get('monto') as string
  const categoria = formData.get('categoria') as string
  const metodo_pago = formData.get('metodo_pago') as string
  const fecha = formData.get('fecha') as string
  const notas = formData.get('notas') as string

  const monto = parseFloat(monto_str)

  if (!concepto || !monto_str || !categoria || !metodo_pago || !fecha) {
    return { error: 'Todos los campos marcados con * son obligatorios' }
  }

  if (isNaN(monto) || monto <= 0) {
    return { error: 'El monto debe ser mayor a 0' }
  }

  const data = {
    concepto,
    monto,
    categoria,
    metodo_pago,
    fecha,
    notas: notas || null
  }

  if (id) {
    const { error } = await supabase.from('egresos').update(data).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('egresos').insert([data])
    if (error) return { error: error.message }
  }

  revalidatePath('/egresos')
  redirect('/egresos')
}

export async function deleteEgreso(id: string) {
  const supabase = await createClient()
  if (!supabase) return { error: 'Supabase no configurado' }
  const { error } = await supabase.from('egresos').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/egresos')
}
