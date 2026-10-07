'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin, requireRoles } from '@/lib/utils/authz'
import { parseMoneyInput } from '@/lib/utils/contable'
import { errorDeAccion, type ActionState } from '@/lib/utils/acciones'
import { SinCambiosError } from '@/lib/operaciones/errores'
import { crearAnticipo } from '@/lib/operaciones/movimientos'
import {
  cambiarEstadoPersona,
  crearPersona,
  editarPersona,
  eliminarPersona,
  siguienteCodigoPersona,
  type DatosPersona,
} from '@/lib/operaciones/personas'
import { pagarDeudasConSaldo as pagarDeudasConSaldoOp, revertirAnticipo as revertirAnticipoOp } from '@/lib/operaciones/saldo-favor'

// Personas (asistentes) y su saldo a favor. Las reglas viven en
// lib/operaciones (las mismas que usa el MCP); aqui solo se autentica, se lee
// el formulario y se refrescan las pantallas.

export type { ActionState }

const textoDe = (formData: FormData, campo: string) => {
  const valor = formData.get(campo)
  return typeof valor === 'string' ? valor.trim() : ''
}

export async function saveAsistente(id: string | null, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { supabase, user, perfil } = await requireRoles(['admin', 'caja'])
    const actor = { userId: user.id, role: perfil.rol === 'admin' ? ('admin' as const) : ('caja' as const) }

    const datos: DatosPersona = {
      nombre: textoDe(formData, 'nombre'),
      cedula: textoDe(formData, 'cedula'),
      correo: textoDe(formData, 'correo'),
      telefono: textoDe(formData, 'telefono'),
      codigo: textoDe(formData, 'codigo'),
    }
    if (!datos.nombre) return { error: 'El nombre es obligatorio' }

    // Solo admin maneja las fechas; para caja el formulario las muestra
    // bloqueadas y aqui ni se tocan (asi no se borran al editar otra cosa).
    if (actor.role === 'admin') {
      datos.fechaRegistro = textoDe(formData, 'fecha_registro')
      datos.fechaInicioProceso = textoDe(formData, 'fecha_inicio_proceso')
    }

    if (id) {
      try {
        await editarPersona(supabase, actor, id, datos)
      } catch (e) {
        if (!(e instanceof SinCambiosError)) throw e
      }
    } else {
      await crearPersona(supabase, actor, datos)
    }
  } catch (e) {
    return errorDeAccion(e, 'No se pudo guardar la persona.', 'asistentes')
  }

  revalidatePath('/asistentes')
  redirect('/asistentes')
}

export async function toggleAsistenteEstado(id: string, activo: boolean): Promise<void> {
  try {
    const { supabase, user } = await requireAdmin()
    await cambiarEstadoPersona(supabase, { userId: user.id, role: 'admin' }, id, activo)
  } catch (e) {
    // El boton es un <form action>: no hay donde mostrar el error, queda en el log.
    console.error('[asistentes] no se pudo cambiar el estado', e)
    return
  }
  revalidatePath('/asistentes')
}

export async function saveAnticipo(asistente_id: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const monto = parseMoneyInput(formData.get('monto'))
  const metodo_pago = textoDe(formData, 'metodo_pago')
  const fecha = textoDe(formData, 'fecha')
  const notas = textoDe(formData, 'notas') || null

  if (monto === null || monto <= 0) return { error: 'El monto debe ser mayor a 0' }
  if (!metodo_pago || !fecha) return { error: 'Método y fecha son obligatorios' }

  try {
    const { supabase, user, perfil } = await requireRoles(['admin', 'caja'])
    // Nucleo compartido con el MCP: mismas reglas y misma auditoria.
    await crearAnticipo(
      supabase,
      { userId: user.id, role: perfil.rol === 'admin' ? 'admin' : 'caja' },
      { asistenteId: asistente_id, monto, metodoPago: metodo_pago, fecha, notas }
    )
  } catch (e) {
    return errorDeAccion(e, 'No se pudo registrar el anticipo.', 'asistentes')
  }

  revalidatePath(`/asistentes/${asistente_id}`)
  return { success: true }
}

export async function revertirAnticipo(asistente_id: string, anticipo_id: string): Promise<ActionState> {
  try {
    const { supabase, user } = await requireAdmin()
    // Reversion atomica (RPC): anula el ingreso e inserta la compensacion juntos,
    // con bloqueo por persona y revalidacion del saldo disponible.
    await revertirAnticipoOp(supabase, { userId: user.id, role: 'admin' }, { asistenteId: asistente_id, anticipoId: anticipo_id })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo revertir el anticipo.', 'asistentes')
  }

  revalidatePath(`/asistentes/${asistente_id}`)
  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/liquidaciones')
  return { success: true }
}

export async function deleteAsistente(id: string): Promise<ActionState> {
  try {
    const { supabase, user } = await requireAdmin()
    // Solo se borra si no tiene cuentas: si las tuviera, la cascada se llevaria pagos y sesiones.
    await eliminarPersona(supabase, { userId: user.id, role: 'admin' }, id)
  } catch (e) {
    return errorDeAccion(e, 'No se pudo eliminar la persona.', 'asistentes')
  }

  revalidatePath('/asistentes')
  return { success: true }
}

export async function pagarDeudasConSaldo(asistente_id: string): Promise<ActionState> {
  try {
    const { supabase, user } = await requireAdmin()
    const resultado = await pagarDeudasConSaldoOp(supabase, { userId: user.id, role: 'admin' }, asistente_id)
    revalidatePath(`/asistentes/${asistente_id}`)
    revalidatePath('/cuentas')
    if (resultado.parcial) {
      return {
        error: `Se aplicaron ${resultado.aplicadas.length} cuenta(s), pero se detuvo en la siguiente: ${resultado.motivo}`,
      }
    }
  } catch (e) {
    return errorDeAccion(e, 'No se pudo aplicar el saldo a favor.', 'asistentes')
  }

  return { success: true }
}

export async function obtenerSiguienteCodigoAsistente(): Promise<number> {
  try {
    const { supabase } = await requireRoles(['admin', 'caja'])
    return Number(await siguienteCodigoPersona(supabase))
  } catch {
    return 1
  }
}
