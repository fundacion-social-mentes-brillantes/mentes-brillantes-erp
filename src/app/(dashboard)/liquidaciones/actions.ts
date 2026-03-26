'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { filtrarIngresosOperativos, esAnuladoCompleto, sumarMontos } from '@/lib/utils/contable'
import { requireAdmin } from '@/lib/utils/authz'

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
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const socio_id = formData.get('socio_id') as string
  const monto_str = formData.get('monto') as string
  const fecha = formData.get('fecha') as string
  const notas = formData.get('notas') as string

  const monto = parseFloat(monto_str)

  if (!socio_id || !monto_str || !fecha) {
    return { error: 'Socio, monto y fecha son obligatorios' }
  }

  if (isNaN(monto) || monto <= 0) {
    return { error: 'El monto debe ser mayor a 0' }
  }

  const { error } = await supabase.from('adelantos_socios').insert([
    {
      socio_id,
      periodo_id,
      monto,
      fecha,
      notas: notas || null,
    },
  ])

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/liquidaciones/${periodo_id}`)
  return { success: true }
}

export async function generarLiquidacion(periodo_id: string) {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch {
    return
  }

  const { data: periodo } = await supabase.from('periodos').select('*').eq('id', periodo_id).single()
  if (!periodo || periodo.estado !== 'abierto') return

  const { data: rawIngresosData } = await supabase
    .from('pagos_abonos')
    .select('monto, metodo_pago, origen_fondos, estado, notas')
    .gte('fecha_pago', periodo.fecha_inicio)
    .lte('fecha_pago', periodo.fecha_fin)

  const ingresosValidos = filtrarIngresosOperativos(rawIngresosData ?? [], {
    excluirSaldoAFavor: true,
    excluirAplicacionSaldo: true,
  })
  const ingresos_cobrados = Math.round(sumarMontos(ingresosValidos))

  const { data: rawDonaciones } = await supabase
    .from('donaciones_asistentes')
    .select('monto, estado, notas')
    .gte('fecha', periodo.fecha_inicio)
    .lte('fecha', periodo.fecha_fin)

  const donacionesValidas =
    rawDonaciones?.filter((d) => d.estado !== 'anulado' && !d.notas?.includes('[ANULADO]')) || []
  const donaciones_periodo = Math.round(sumarMontos(donacionesValidas))
  const ingresos_operativos = ingresos_cobrados + donaciones_periodo

  const { data: rawEgresosData } = await supabase
    .from('egresos')
    .select('monto, estado, notas')
    .gte('fecha', periodo.fecha_inicio)
    .lte('fecha', periodo.fecha_fin)

  const egresosValidos = (rawEgresosData ?? []).filter((item) => !esAnuladoCompleto(item))
  const egresos_periodo = Math.round(sumarMontos(egresosValidos))

  const utilidad_neta = ingresos_operativos - egresos_periodo

  const { data: socios } = await supabase.from('socios').select('*').eq('activo', true)
  if (!socios) return

  const { data: adelantosData } = await supabase.from('adelantos_socios').select('*').eq('periodo_id', periodo_id)

  const liquidaciones = socios.map((socio) => {
    const porcentaje_aplicado = Number(socio.porcentaje_participacion)
    const valor_correspondiente = Math.round((utilidad_neta * porcentaje_aplicado) / 100)

    const adelantos_socio = adelantosData?.filter((a) => a.socio_id === socio.id) || []
    const adelantos_descontados = Math.round(adelantos_socio.reduce((acc, curr) => acc + Number(curr.monto), 0))

    const valor_neto_pagar = Math.round(valor_correspondiente - adelantos_descontados)

    return {
      periodo_id,
      socio_id: socio.id,
      ingresos_cobrados,
      donaciones_periodo,
      ingresos_operativos,
      egresos_periodo,
      utilidad_neta,
      porcentaje_aplicado,
      valor_correspondiente,
      adelantos_descontados,
      valor_neto_pagar,
    }
  })

  await supabase.from('liquidaciones_socios').insert(liquidaciones)
  await supabase.from('periodos').update({ estado: 'cerrado' }).eq('id', periodo_id)

  revalidatePath('/liquidaciones')
  revalidatePath(`/liquidaciones/${periodo_id}`)
}
