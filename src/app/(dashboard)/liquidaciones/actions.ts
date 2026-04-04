'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/utils/authz'
import { parseMoneyInput } from '@/lib/utils/contable'
import { assertNoPeriodOverlap, assertPeriodoAbierto } from '@/lib/utils/periodos'

export type ActionState = {
  error?: string
  success?: boolean
} | null

export async function savePeriodo(prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const nombre = formData.get('nombre') as string
  const fecha_inicio = formData.get('fecha_inicio') as string
  const fecha_fin = formData.get('fecha_fin') as string

  if (!nombre || !fecha_inicio || !fecha_fin) {
    return { error: 'Todos los campos son obligatorios' }
  }

  if (new Date(fecha_inicio) > new Date(fecha_fin)) {
    return { error: 'La fecha de inicio no puede ser mayor a la fecha de fin' }
  }

  const { data: periodosAbiertos } = await supabase.from('periodos').select('id').eq('estado', 'abierto')
  if (periodosAbiertos && periodosAbiertos.length > 0) {
    return { error: 'Ya existe un período abierto. Debes cerrarlo antes de crear uno nuevo.' }
  }

  const overlapError = await assertNoPeriodOverlap(supabase, fecha_inicio, fecha_fin)
  if (overlapError) {
    return { error: overlapError }
  }

  const { error } = await supabase.from('periodos').insert([
    {
      nombre,
      fecha_inicio,
      fecha_fin,
      estado: 'abierto',
    },
  ])

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/liquidaciones')
  redirect('/liquidaciones')
}

export async function saveAdelanto(periodo_id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const socio_id = formData.get('socio_id') as string
  const monto_str = formData.get('monto') as string
  const fecha = formData.get('fecha') as string
  const notas = formData.get('notas') as string
   const metodo_pago = (formData.get('metodo_pago') as string) || 'otro'

  const monto = parseMoneyInput(monto_str)

  if (!socio_id || !monto_str || !fecha || !metodo_pago) {
    return { error: 'Socio, monto, fecha y método de pago son obligatorios' }
  }

  if (monto === null) {
    return { error: 'El monto tiene un formato invalido' }
  }

  if (monto <= 0) {
    return { error: 'El monto debe ser mayor a 0' }
  }

  const { error: periodoError, periodo } = await assertPeriodoAbierto(supabase, periodo_id, 'Registrar el adelanto')
  if (periodoError || !periodo) return { error: periodoError }
  if (fecha < periodo.fecha_inicio || fecha > periodo.fecha_fin) {
    return { error: `La fecha del adelanto debe estar dentro del período ${periodo.nombre}.` }
  }

  const { data: adelantoInsertado, error } = await supabase.from('adelantos_socios').insert([
    {
      socio_id,
      periodo_id,
      monto,
      fecha,
      metodo_pago,
      notas: notas || null,
      usuario_id: user?.id || null,
    },
  ]).select('id').single()

  if (error) {
    return { error: error.message }
  }

  await supabase.from('auditoria_financiera').insert([
    {
      tabla_afectada: 'adelantos_socios',
      registro_id: adelantoInsertado.id,
      usuario_id: user?.id || '',
      accion: 'crear_adelanto',
      valor_anterior: null,
      valor_nuevo: monto,
      motivo: 'Registro de adelanto a socio',
    },
  ])

  revalidatePath(`/liquidaciones/${periodo_id}`)
  return { success: true }
}

export async function generarLiquidacion(periodo_id: string) {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch {
    return
  }

  const { data: periodo } = await supabase.from('periodos').select('estado').eq('id', periodo_id).single()
  if (!periodo || periodo.estado !== 'abierto') return

  const { error } = await supabase.rpc('fn_cerrar_liquidacion', { p_periodo_id: periodo_id })
  if (error) {
    console.error('Error RPC fn_cerrar_liquidacion:', error)
    return
  }

  await supabase.from('auditoria_financiera').insert([
    {
      tabla_afectada: 'periodos',
      registro_id: periodo_id,
      usuario_id: user?.id || '',
      accion: 'cerrar_liquidacion',
      valor_anterior: null,
      valor_nuevo: null,
      motivo: 'Cierre de período y generación de liquidación',
    },
  ])

  revalidatePath('/liquidaciones')
  revalidatePath(`/liquidaciones/${periodo_id}`)
}
