'use server'

import { revalidatePath } from 'next/cache'
import { AuthzError, requireAdmin } from '@/lib/utils/authz'
import { OperacionError } from '@/lib/operaciones/errores'
import {
  cambiarMedioPagoActivo,
  crearMedioPago,
  moverMedioPago,
  renombrarMedioPago,
} from '@/lib/operaciones/medios-pago'
import { mensajeDeError } from '@/lib/utils/errores'

// Cuentas de dinero (Configuracion). Las reglas viven en lib/operaciones/medios-pago.ts.

export type CuentaDineroState = { error?: string; success?: boolean; mensaje?: string } | null

async function hacer(accion: (supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase']) => Promise<string>): Promise<CuentaDineroState> {
  try {
    const { supabase } = await requireAdmin()
    const mensaje = await accion(supabase)
    // Los nombres se usan en todo el ERP (los lee el layout): se refresca todo.
    revalidatePath('/', 'layout')
    return { success: true, mensaje }
  } catch (error) {
    if (error instanceof OperacionError || error instanceof AuthzError) return { error: error.message }
    console.error('[cuentas de dinero]', error)
    return { error: mensajeDeError(error, 'No se pudo guardar el cambio.') }
  }
}

export async function crearCuentaDinero(_prev: CuentaDineroState, formData: FormData): Promise<CuentaDineroState> {
  return hacer(async (supabase) => {
    const medio = await crearMedioPago(supabase, formData.get('nombre'))
    return `Cuenta «${medio.nombre}» agregada. Ya aparece en todos los formularios.`
  })
}

export async function renombrarCuentaDinero(clave: string, nombre: string): Promise<CuentaDineroState> {
  return hacer(async (supabase) => {
    const limpio = await renombrarMedioPago(supabase, clave, nombre)
    return `Ahora se llama «${limpio}». Los pagos de antes quedan en la misma cuenta.`
  })
}

export async function cambiarCuentaDineroActiva(clave: string, activo: boolean): Promise<CuentaDineroState> {
  return hacer(async (supabase) => {
    await cambiarMedioPagoActivo(supabase, clave, activo)
    return activo ? 'La cuenta vuelve a aparecer en los formularios.' : 'La cuenta quedó oculta. Sus pagos de antes no cambian.'
  })
}

export async function moverCuentaDinero(clave: string, direccion: 'arriba' | 'abajo'): Promise<CuentaDineroState> {
  return hacer(async (supabase) => {
    await moverMedioPago(supabase, clave, direccion)
    return 'Orden guardado.'
  })
}
