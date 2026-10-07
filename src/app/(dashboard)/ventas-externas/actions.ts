'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin, requireRoles } from '@/lib/utils/authz'
import { parseMoneyInput } from '@/lib/utils/contable'
import { fechaHoyBogota } from '@/lib/utils/fechas'
import { errorDeAccion } from '@/lib/utils/acciones'
import { anularMovimiento, editarMovimiento, eliminarMovimiento } from '@/lib/operaciones/anulaciones'
import { SinCambiosError } from '@/lib/operaciones/errores'
import { crearVentaExterna as crearVentaExternaCore } from '@/lib/operaciones/movimientos'

// Ventas externas. Todo pasa por lib/operaciones, igual que en el Historial
// General y el MCP. Antes, corregir una venta sin notas mandaba el motivo de
// auditoria en null; la base lo rechazaba y el cambio quedaba sin rastro.

export type VentaExternaState = { error?: string; success?: boolean } | null

const REVALIDATE_PATHS = ['/ventas-externas', '/movimientos', '/dashboard', '/liquidaciones']

const revalidarVentasExternas = () => {
  REVALIDATE_PATHS.forEach((path) => revalidatePath(path))
}

function leerPayload(formData: FormData) {
  const texto = (campo: string) => {
    const valor = formData.get(campo)
    return typeof valor === 'string' ? valor.trim() : ''
  }
  return {
    concepto: texto('concepto'),
    comprador_nombre: texto('comprador_nombre') || null,
    monto: parseMoneyInput(formData.get('monto')),
    metodo_pago: texto('metodo_pago'),
    fecha: texto('fecha') || fechaHoyBogota(),
    notas: texto('notas') || null,
  }
}

const FALTAN_DATOS = 'Concepto, monto, metodo de pago y fecha son obligatorios. El monto debe ser mayor a 0.'

export async function crearVentaExterna(_prevState: VentaExternaState, formData: FormData): Promise<VentaExternaState> {
  const payload = leerPayload(formData)
  if (!payload.concepto || payload.monto === null || payload.monto <= 0 || !payload.metodo_pago || !payload.fecha) {
    return { error: FALTAN_DATOS }
  }

  try {
    const { supabase, user, perfil } = await requireRoles(['admin', 'caja'])
    // Nucleo compartido con el MCP: mismas reglas y misma auditoria.
    await crearVentaExternaCore(
      supabase,
      { userId: user.id, role: perfil.rol === 'admin' ? 'admin' : 'caja' },
      {
        concepto: payload.concepto,
        compradorNombre: payload.comprador_nombre,
        monto: payload.monto,
        metodoPago: payload.metodo_pago,
        fecha: payload.fecha,
        notas: payload.notas,
      }
    )
  } catch (e) {
    return errorDeAccion(e, 'No se pudo registrar la venta externa.', 'ventas-externas')
  }
  revalidarVentasExternas()
  redirect('/ventas-externas')
}

export async function editarVentaExterna(
  id: string,
  _prevState: VentaExternaState,
  formData: FormData
): Promise<VentaExternaState> {
  const payload = leerPayload(formData)
  if (!payload.concepto || payload.monto === null || payload.monto <= 0 || !payload.metodo_pago || !payload.fecha) {
    return { error: FALTAN_DATOS }
  }

  try {
    const { supabase, user } = await requireAdmin()
    await editarMovimiento(supabase, { userId: user.id, role: 'admin' }, {
      tipo: 'venta_externa',
      movimientoId: id,
      concepto: payload.concepto,
      compradorNombre: payload.comprador_nombre,
      monto: payload.monto,
      metodoPago: payload.metodo_pago,
      fecha: payload.fecha,
      notas: payload.notas,
      motivo: 'Actualización de venta externa',
    })
  } catch (e) {
    if (!(e instanceof SinCambiosError)) return errorDeAccion(e, 'No se pudo editar la venta externa.', 'ventas-externas')
  }
  revalidarVentasExternas()
  redirect('/ventas-externas')
}

export async function anularVentaExterna(id: string): Promise<VentaExternaState> {
  try {
    const { supabase, user } = await requireAdmin()
    await anularMovimiento(supabase, { userId: user.id, role: 'admin' }, {
      tipo: 'venta_externa',
      movimientoId: id,
      motivo: 'Anulacion de venta externa',
    })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo anular la venta externa.', 'ventas-externas')
  }
  revalidarVentasExternas()
  return { success: true }
}

export async function eliminarVentaExterna(id: string): Promise<VentaExternaState> {
  try {
    const { supabase, user } = await requireAdmin()
    await eliminarMovimiento(supabase, { userId: user.id, role: 'admin' }, {
      tipo: 'venta_externa',
      movimientoId: id,
      motivo: 'Eliminacion definitiva',
    })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo eliminar la venta externa.', 'ventas-externas')
  }
  revalidarVentasExternas()
  return { success: true }
}
