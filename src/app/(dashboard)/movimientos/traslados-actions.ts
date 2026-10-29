'use server'

import { revalidatePath } from 'next/cache'
import { AuthzError, requireAdmin } from '@/lib/utils/authz'
import { OperacionError } from '@/lib/operaciones/errores'
import { anularTraslado, registrarTraslado } from '@/lib/operaciones/traslados'
import { mensajeDeError } from '@/lib/utils/errores'
import { pesos } from '@/lib/utils/pesos'

// Traslados entre cuentas de la fundacion. Solo el admin los registra o anula
// (decision de Sebastian, 2026-10-29). Las reglas viven en
// lib/operaciones/traslados.ts, las mismas del MCP.

export type TrasladoState = { error?: string; success?: boolean; mensaje?: string } | null

function comoError(error: unknown, porDefecto: string): TrasladoState {
  if (error instanceof OperacionError || error instanceof AuthzError) return { error: error.message }
  console.error('[traslados]', error)
  return { error: mensajeDeError(error, porDefecto) }
}

function refrescar() {
  revalidatePath('/movimientos')
  revalidatePath('/liquidaciones', 'layout')
}

const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? '').trim()

export async function registrarTrasladoAction(_prev: TrasladoState, formData: FormData): Promise<TrasladoState> {
  try {
    const { supabase, user } = await requireAdmin()
    const monto = Number(texto(formData, 'monto').replace(/[^\d]/g, ''))
    const t = await registrarTraslado(supabase, { userId: user.id, role: 'admin' }, {
      monto,
      origen: texto(formData, 'origen'),
      destino: texto(formData, 'destino'),
      fecha: texto(formData, 'fecha'),
      notas: texto(formData, 'notas') || null,
    })
    refrescar()
    return { success: true, mensaje: `Traslado registrado: ${pesos(t.monto)} de ${t.descripcion}.` }
  } catch (error) {
    return comoError(error, 'No se pudo registrar el traslado.')
  }
}

export async function anularTrasladoAction(trasladoId: string, motivo: string): Promise<TrasladoState> {
  try {
    const { supabase, user } = await requireAdmin()
    await anularTraslado(supabase, { userId: user.id, role: 'admin' }, trasladoId, motivo)
    refrescar()
    return { success: true, mensaje: 'Traslado anulado.' }
  } catch (error) {
    return comoError(error, 'No se pudo anular el traslado.')
  }
}
