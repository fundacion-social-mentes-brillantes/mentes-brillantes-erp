'use server'

import { revalidatePath } from 'next/cache'
import { AuthzError, requireAdmin } from '@/lib/utils/authz'
import {
  ANTICIPO_BLOQUEADO,
  APLICACION_SALDO_BLOQUEADA,
  anularMovimiento as anularMovimientoOp,
  editarMovimiento as editarMovimientoOp,
  eliminarMovimiento as eliminarMovimientoOp,
} from '@/lib/operaciones/anulaciones'
import { OperacionError } from '@/lib/operaciones/errores'
import { esTipoMovimiento, type TipoMovimiento } from '@/lib/operaciones/registros-movimiento'
import { mensajeDeError } from '@/lib/utils/errores'

// Historial General: anular, editar y eliminar movimientos. Las reglas
// contables viven en lib/operaciones/anulaciones.ts, las mismas que usa el
// MCP; aqui solo se autentica, se traduce lo que manda el formulario y se
// refrescan las pantallas.

export type ActionState = {
  error?: string
  success?: boolean
} | null

/** Lo que el formulario puede cambiar. Solo llegan los campos que la persona toco. */
export type CambiosEdicionMovimiento = {
  monto?: number | string
  fecha?: string
  concepto?: string
  metodo_pago?: string
  asistente_id?: string
  notas?: string
}

type Resultado<T> = { ok: true; valor: T } | { ok: false; estado: ActionState }

function validarTipo(tipo: string): Resultado<TipoMovimiento> {
  if (tipo === 'aplicacion_saldo') return { ok: false, estado: { error: APLICACION_SALDO_BLOQUEADA } }
  if (tipo === 'anticipo') return { ok: false, estado: { error: ANTICIPO_BLOQUEADO } }
  if (!esTipoMovimiento(tipo)) return { ok: false, estado: { error: 'Tipo de movimiento no soportado.' } }
  return { ok: true, valor: tipo }
}

async function actorAdmin() {
  const { supabase, user } = await requireAdmin()
  return { supabase, actor: { userId: user.id, role: 'admin' as const } }
}

function comoError(error: unknown, porDefecto: string): ActionState {
  if (error instanceof OperacionError || error instanceof AuthzError) return { error: error.message }
  console.error('[movimientos]', error)
  return { error: mensajeDeError(error, porDefecto) }
}

function refrescar(tipo: TipoMovimiento) {
  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  revalidatePath('/asistentes')
  revalidatePath('/ventas-externas')
  if (tipo === 'abono') revalidatePath('/cuentas')
}

export async function anularMovimiento(movimiento_id: string, tipo_movimiento: string): Promise<ActionState> {
  const tipo = validarTipo(tipo_movimiento)
  if (!tipo.ok) return tipo.estado

  try {
    const { supabase, actor } = await actorAdmin()
    await anularMovimientoOp(supabase, actor, { tipo: tipo.valor, movimientoId: movimiento_id })
  } catch (error) {
    return comoError(error, 'No se pudo anular el movimiento.')
  }

  refrescar(tipo.valor)
  return { success: true }
}

/** Convierte el texto del formulario en los parametros de la operacion, segun el tipo. */
function parametrosEdicion(tipo: TipoMovimiento, cambios: CambiosEdicionMovimiento) {
  const texto = (v: string | undefined) => (v === undefined ? undefined : String(v).trim())
  const monto = cambios.monto === undefined || cambios.monto === '' ? undefined : Number(cambios.monto)

  return {
    monto,
    fecha: texto(cambios.fecha) || undefined,
    notas: cambios.notas === undefined ? undefined : texto(cambios.notas) || null,
    // Un metodo vacio en el formulario significa "no lo toque".
    metodoPago: texto(cambios.metodo_pago) || undefined,
    // Cada campo solo existe en algunos tipos: lo demas se ignora, como siempre.
    concepto: tipo === 'egreso' || tipo === 'venta_externa' ? texto(cambios.concepto) || undefined : undefined,
    asistenteId: tipo === 'donacion' ? texto(cambios.asistente_id) || undefined : undefined,
  }
}

export async function editarMovimiento(
  movimiento_id: string,
  tipo_movimiento: string,
  cambios: CambiosEdicionMovimiento
): Promise<ActionState> {
  const tipo = validarTipo(tipo_movimiento)
  if (!tipo.ok) return tipo.estado

  const params = parametrosEdicion(tipo.valor, cambios || {})
  if (params.monto !== undefined && !Number.isFinite(params.monto)) {
    return { error: 'El monto no es un numero valido.' }
  }

  try {
    const { supabase, actor } = await actorAdmin()
    await editarMovimientoOp(supabase, actor, { tipo: tipo.valor, movimientoId: movimiento_id, ...params })
  } catch (error) {
    return comoError(error, 'No se pudo editar el movimiento.')
  }

  refrescar(tipo.valor)
  return { success: true }
}

export async function eliminarMovimiento(movimiento_id: string, tipo_movimiento: string): Promise<ActionState> {
  const tipo = validarTipo(tipo_movimiento)
  if (!tipo.ok) return tipo.estado

  try {
    const { supabase, actor } = await actorAdmin()
    await eliminarMovimientoOp(supabase, actor, { tipo: tipo.valor, movimientoId: movimiento_id })
  } catch (error) {
    return comoError(error, 'No se pudo eliminar el movimiento.')
  }

  refrescar(tipo.valor)
  return { success: true }
}
