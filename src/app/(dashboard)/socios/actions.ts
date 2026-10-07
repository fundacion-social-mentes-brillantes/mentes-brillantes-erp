'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/utils/authz'
import { errorDeAccion, type ActionState } from '@/lib/utils/acciones'
import { cambiarEstadoSocio, crearSocio, editarSocio, porcentajeTotalSocios } from '@/lib/operaciones/administracion'

// Socios (solo admin). Los porcentajes de los socios activos no pueden sumar
// mas de 100: la liquidacion reparte la utilidad con ellos y se pagaria mas
// plata de la que hay.

export type { ActionState }

export async function saveSocio(id: string | null, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const nombre = String(formData.get('nombre') ?? '').trim()
  const porcentaje = Number.parseFloat(String(formData.get('porcentaje_participacion') ?? ''))

  if (!nombre) return { error: 'El nombre es obligatorio' }
  if (Number.isNaN(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    return { error: 'El porcentaje debe ser un número entre 0 y 100' }
  }

  try {
    const { supabase, user } = await requireAdmin()
    const actor = { userId: user.id, role: 'admin' as const }

    const otros = await porcentajeTotalSocios(supabase, id ?? undefined)
    if (otros + porcentaje > 100.0001) {
      return {
        error: `Los socios activos ya suman ${otros}%: con ${porcentaje}% quedarían en ${otros + porcentaje}%. Baja primero el porcentaje de otro socio.`,
      }
    }

    if (id) await editarSocio(supabase, actor, id, { nombre, porcentaje })
    else await crearSocio(supabase, actor, { nombre, porcentaje })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo guardar el socio.', 'socios')
  }

  revalidatePath('/socios')
  redirect('/socios')
}

export async function toggleSocioEstado(id: string, activo: boolean): Promise<void> {
  try {
    const { supabase, user } = await requireAdmin()
    if (activo) {
      // Reactivar tambien cuenta para el tope del 100%.
      const { data: socio } = await supabase.from('socios').select('porcentaje_participacion').eq('id', id).single()
      const otros = await porcentajeTotalSocios(supabase, id)
      if (socio && otros + Number(socio.porcentaje_participacion) > 100.0001) {
        console.error('[socios] no se reactiva: pasaria del 100%', { id })
        return
      }
    }
    await cambiarEstadoSocio(supabase, { userId: user.id, role: 'admin' }, id, activo)
  } catch (e) {
    // El boton es un <form action>: no hay donde mostrar el error, queda en el log.
    console.error('[socios] no se pudo cambiar el estado', e)
    return
  }
  revalidatePath('/socios')
}
