'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/utils/authz'
import { parseMoneyInput } from '@/lib/utils/contable'
import { assertFechaEditable } from '@/lib/utils/periodos'

export type ActionState = {
  error?: string
  success?: boolean
} | null

export async function saveEgreso(id: string | null, prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const concepto = formData.get('concepto') as string
  const monto_str = formData.get('monto') as string
  const categoria = formData.get('categoria') as string
  const metodo_pago = formData.get('metodo_pago') as string
  const fecha = formData.get('fecha') as string
  const notas = formData.get('notas') as string

  const monto = parseMoneyInput(monto_str)

  if (!concepto || !monto_str || !categoria || !metodo_pago || !fecha) {
    return { error: 'Todos los campos marcados con * son obligatorios' }
  }

  if (monto === null || monto <= 0) {
    return { error: 'El monto debe ser mayor a 0' }
  }

  if (id) {
    const { data: egresoActual, error: egresoActualError } = await supabase
      .from('egresos')
      .select('fecha, monto')
      .eq('id', id)
      .single()

    if (egresoActualError || !egresoActual) return { error: 'No se encontró el egreso.' }

    const periodoActualError = await assertFechaEditable(supabase, egresoActual.fecha, 'Editar el egreso')
    if (periodoActualError) return { error: periodoActualError }
  }

  const periodoError = await assertFechaEditable(supabase, fecha, id ? 'Editar el egreso' : 'Crear el egreso')
  if (periodoError) return { error: periodoError }

  const data = {
    concepto,
    monto,
    categoria,
    metodo_pago,
    fecha,
    notas: notas || null,
    usuario_id: user?.id || null,
  }

  if (id) {
    const { error } = await supabase.from('egresos').update(data).eq('id', id)
    if (error) return { error: error.message }
    await supabase.from('auditoria_financiera').insert([
      {
        tabla_afectada: 'egresos',
        registro_id: id,
        usuario_id: user?.id || '',
        accion: 'editar_egreso',
        valor_anterior: null,
        valor_nuevo: monto,
        motivo: 'Actualización de egreso',
      },
    ])
  } else {
    const { data: egresoInsertado, error } = await supabase.from('egresos').insert([data]).select('id').single()
    if (error) return { error: error.message }
    await supabase.from('auditoria_financiera').insert([
      {
        tabla_afectada: 'egresos',
        registro_id: egresoInsertado.id,
        usuario_id: user?.id || '',
        accion: 'crear_egreso',
        valor_anterior: null,
        valor_nuevo: monto,
        motivo: 'Creación de egreso',
      },
    ])
  }

  revalidatePath('/egresos')
  redirect('/egresos')
}

export async function deleteEgreso(id: string) {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { data: egreso, error: egresoError } = await supabase
    .from('egresos')
    .select('fecha, monto')
    .eq('id', id)
    .single()
  if (egresoError || !egreso) return { error: 'No se encontró el egreso.' }

  const periodoError = await assertFechaEditable(supabase, egreso.fecha, 'Eliminar el egreso')
  if (periodoError) return { error: periodoError }

  const { error } = await supabase.from('egresos').delete().eq('id', id)
  if (error) return { error: error.message }
  await supabase.from('auditoria_financiera').insert([
    {
      tabla_afectada: 'egresos',
      registro_id: id,
      usuario_id: user?.id || '',
      accion: 'eliminar_egreso',
      valor_anterior: egreso.monto,
      valor_nuevo: null,
      motivo: 'Eliminación definitiva de egreso',
    },
  ])
  revalidatePath('/egresos')
}
