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

export async function updatePeriodoFechaFin(periodoId: string, nuevaFechaFin: string): Promise<ActionState> {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  if (!periodoId || !nuevaFechaFin) {
    return { error: 'La nueva fecha final es obligatoria.' }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFechaFin)) {
    return { error: 'La fecha final no tiene un formato valido.' }
  }

  const { data: periodo, error: periodoError } = await supabase
    .from('periodos')
    .select('id, nombre, fecha_inicio, fecha_fin, estado')
    .eq('id', periodoId)
    .single()

  if (periodoError || !periodo) {
    return { error: 'No se encontro el periodo contable.' }
  }

  if (periodo.estado !== 'abierto') {
    return { error: 'No se puede modificar un periodo cerrado.' }
  }

  if (nuevaFechaFin < periodo.fecha_inicio) {
    return { error: 'La fecha final no puede ser anterior a la fecha de inicio.' }
  }

  const { data: solapes, error: solapesError } = await supabase
    .from('periodos')
    .select('id, nombre, fecha_inicio, fecha_fin')
    .neq('id', periodoId)
    .lte('fecha_inicio', nuevaFechaFin)
    .gte('fecha_fin', periodo.fecha_inicio)
    .limit(1)

  if (solapesError) {
    return { error: 'No se pudo validar el solapamiento de periodos.' }
  }

  const periodoSolapado = solapes?.[0]
  if (periodoSolapado) {
    return {
      error: `El rango se superpone con ${periodoSolapado.nombre} (${periodoSolapado.fecha_inicio} a ${periodoSolapado.fecha_fin}).`,
    }
  }

  const { error } = await supabase
    .from('periodos')
    .update({ fecha_fin: nuevaFechaFin })
    .eq('id', periodoId)
    .eq('estado', 'abierto')
    .select('id')
    .single()

  if (error) {
    return { error: 'No se pudo actualizar la fecha final del periodo abierto.' }
  }

  revalidatePath('/liquidaciones')
  revalidatePath(`/liquidaciones/${periodoId}`)
  return { success: true }
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

  const { data: adelantoInsertado, error } = await supabase
    .from('adelantos_socios')
    .insert([
      {
        socio_id,
        periodo_id,
        monto,
        fecha,
        metodo_pago,
        notas: notas || null,
        usuario_id: user?.id || null,
      },
    ])
    .select('id')
    .single()

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

export async function generarLiquidacion(periodo_id: string): Promise<ActionState> {
  let supabase, user
  try {
    ;({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { data: periodo, error: periodoError } = await supabase.from('periodos').select('estado').eq('id', periodo_id).single()
  if (periodoError) {
    return { error: periodoError.message || 'No se pudo consultar el período.' }
  }
  if (!periodo) return { error: 'No se encontró el período.' }
  if (periodo.estado !== 'abierto') return { error: 'El período ya no está abierto para cerrar y liquidar.' }

  const { error } = await supabase.rpc('fn_cerrar_liquidacion', { p_periodo_id: periodo_id })
  if (error) {
    return { error: error.message || 'No se pudo cerrar el período y generar la liquidación.' }
  }

  const { error: auditError } = await supabase.from('auditoria_financiera').insert([
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

  if (auditError) {
    return { error: auditError.message || 'La liquidación se cerró, pero no se pudo registrar la auditoría.' }
  }

  revalidatePath('/liquidaciones')
  revalidatePath(`/liquidaciones/${periodo_id}`)
  return { success: true }
}
