'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/utils/authz'
import { parseMoneyInput } from '@/lib/utils/contable'
import { errorDeAccion, type ActionState } from '@/lib/utils/acciones'
import { editarMovimiento, eliminarMovimiento } from '@/lib/operaciones/anulaciones'
import { SinCambiosError } from '@/lib/operaciones/errores'
import { crearEgreso } from '@/lib/operaciones/movimientos'

// Egresos. Crear, corregir y borrar pasan por lib/operaciones: las mismas
// reglas (periodo abierto, nada anulado se edita, auditoria con el monto real
// de la base) que el Historial General y el MCP.

export type { ActionState }

const textoDe = (formData: FormData, campo: string) => {
  const valor = formData.get(campo)
  return typeof valor === 'string' ? valor.trim() : ''
}

export async function saveEgreso(id: string | null, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const concepto = textoDe(formData, 'concepto')
  const montoTexto = textoDe(formData, 'monto')
  const categoria = textoDe(formData, 'categoria')
  const metodo_pago = textoDe(formData, 'metodo_pago')
  const fecha = textoDe(formData, 'fecha')
  const notas = textoDe(formData, 'notas') || null

  if (!concepto || !montoTexto || !categoria || !metodo_pago || !fecha) {
    return { error: 'Todos los campos marcados con * son obligatorios' }
  }

  const monto = parseMoneyInput(montoTexto)
  if (monto === null || monto <= 0) {
    return { error: 'El monto debe ser mayor a 0' }
  }

  try {
    const { supabase, user } = await requireAdmin()
    const actor = { userId: user.id, role: 'admin' as const }

    if (id) {
      try {
        await editarMovimiento(supabase, actor, {
          tipo: 'egreso',
          movimientoId: id,
          concepto,
          monto,
          categoria,
          metodoPago: metodo_pago,
          fecha,
          notas,
          motivo: 'Actualización de egreso',
        })
      } catch (e) {
        if (!(e instanceof SinCambiosError)) throw e
      }
    } else {
      await crearEgreso(supabase, actor, { concepto, monto, categoria, metodoPago: metodo_pago, fecha, notas })
    }
  } catch (e) {
    return errorDeAccion(e, 'No se pudo guardar el egreso.', 'egresos')
  }

  revalidatePath('/egresos')
  redirect('/egresos')
}

export async function deleteEgreso(id: string): Promise<ActionState> {
  try {
    const { supabase, user } = await requireAdmin()
    await eliminarMovimiento(supabase, { userId: user.id, role: 'admin' }, {
      tipo: 'egreso',
      movimientoId: id,
      motivo: 'Eliminación definitiva de egreso',
    })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo eliminar el egreso.', 'egresos')
  }

  revalidatePath('/egresos')
  return { success: true }
}
