'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ActionState = {
  error?: string;
  success?: boolean;
} | null;

export async function anularMovimiento(
  movimiento_id: string,
  tipo_movimiento: string,
  valor_ingreso: number,
  asistente_id: string | null
): Promise<ActionState> {
  const supabase = await createClient()
  if (!supabase) return { error: 'Supabase no configurado' }

  // Solo administradores pueden anular
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'admin') {
    return { error: 'Acceso denegado. Solo administradores pueden anular movimientos.' }
  }

  // 1. Identificar la tabla y actualizar estado
  let tablaDestino = '';
  switch (tipo_movimiento) {
    case 'abono':
    case 'aplicacion_saldo':
      tablaDestino = 'pagos_abonos';
      break;
    case 'egreso':
      tablaDestino = 'egresos';
      break;
    case 'anticipo':
      tablaDestino = 'movimientos_saldo_favor';
      break;
    default:
      return { error: 'Tipo de movimiento no soportado para anulación directa.' }
  }

  // Obtener notas actuales
  const { data: recordData } = await supabase.from(tablaDestino).select('notas').eq('id', movimiento_id).single()
  const currentNotas = recordData?.notas || ''
  const newNotas = `[ANULADO] ${currentNotas}`.trim()
  
  // Marcar como anulado y actualizar notas
  const { error: updateError } = await supabase
    .from(tablaDestino)
    .update({ estado: 'anulado', notas: newNotas }) // Require "estado" column en DB
    .eq('id', movimiento_id)

  if (updateError) {
    if (updateError.code === 'PGRST204' || updateError.message.includes('column "estado" of relation')) {
      return { error: 'Falta ejecutar la migración SQL en Supabase para agregar la columna "estado" a las tablas financieras.' }
    }
    return { error: updateError.message }
  }

  // 2. Revertir saldo_favor si era una 'aplicacion_saldo' o 'anticipo'
  if (tipo_movimiento === 'aplicacion_saldo' && asistente_id) {
    // Si era una aplicación (gasto de saldo a favor), devolvemos el saldo sumando un ingreso
    await supabase.from('movimientos_saldo_favor').insert([{
      asistente_id,
      tipo: 'ingreso',
      monto: valor_ingreso,
      fecha: new Date().toISOString().split('T')[0],
      metodo_pago: 'saldo_a_favor',
      notas: `Reversión automática por anulación del movimiento: ${movimiento_id}`
    }]);
  } else if (tipo_movimiento === 'anticipo' && asistente_id) {
    // Si anulamos un anticipo (ingreso de saldo), lo descontamos con una aplicación
    await supabase.from('movimientos_saldo_favor').insert([{
      asistente_id,
      tipo: 'aplicacion',
      monto: valor_ingreso,
      fecha: new Date().toISOString().split('T')[0],
      metodo_pago: 'saldo_a_favor',
      notas: `Reversión automática por anulación del anticipo: ${movimiento_id}`
    }]);
  }

  // 3. Reabrir o ajustar la cuenta_por_cobrar si era un pago ('abono' o 'aplicacion_saldo')
  if ((tipo_movimiento === 'abono' || tipo_movimiento === 'aplicacion_saldo') && tablaDestino === 'pagos_abonos') {
    // Buscar la cuenta_id asociada al pago
    const { data: pago } = await supabase.from('pagos_abonos').select('cuenta_id').eq('id', movimiento_id).single()
    
    if (pago?.cuenta_id) {
      // Recalcular estado de la cuenta
      const { data: cuentaData } = await supabase
        .from('cuentas_por_cobrar')
        .select('valor_total, pagos_abonos(id, monto, estado)')
        .eq('id', pago.cuenta_id)
        .single()

      if (cuentaData) {
        // Sumar solo los abonos que NO estén anulados
        const pagosValidos = cuentaData.pagos_abonos?.filter((p: any) => p.estado !== 'anulado') || []
        const total_abonado = pagosValidos.reduce((sum: number, p: any) => sum + Number(p.monto), 0)
        
        const valor_total = Number(cuentaData.valor_total)
        let nuevo_estado = 'pendiente'
        if (total_abonado >= valor_total) {
          nuevo_estado = 'pagado'
        } else if (total_abonado > 0) {
          nuevo_estado = 'parcial'
        }

        await supabase.from('cuentas_por_cobrar').update({ estado: nuevo_estado }).eq('id', pago.cuenta_id)
      }
    }
  }

  // Registrar auditoría
  await supabase.from('auditoria_financiera').insert([{
    tabla_afectada: tablaDestino,
    registro_id: movimiento_id,
    usuario_id: user.id,
    accion: 'anulacion_movimiento',
    valor_anterior: valor_ingreso,
    valor_nuevo: 0,
    motivo: 'Anulación solicitada por el administrador via Interfaz.'
  }])

  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/asistentes')
  revalidatePath('/cuentas')
  
  return { success: true }
}
