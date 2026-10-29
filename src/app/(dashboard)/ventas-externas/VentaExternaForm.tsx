'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { crearVentaExterna, editarVentaExterna } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Tables } from '@/lib/supabase/types'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'
import { OpcionesMedioPago } from '@/components/medios-pago/MediosPago'

export function VentaExternaForm({ venta }: { venta?: Tables<'ventas_externas'> | null }) {
  const action = venta?.id ? editarVentaExterna.bind(null, venta.id) : crearVentaExterna
  const [state, formAction, isPending] = useActionState(action, null)
  const recordarFormulario = useConservarSiFalla(state)

  const selectClass =
    'flex h-10 w-full rounded-md border border-linea bg-panel px-3 py-2 text-sm text-tinta ring-offset-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:[color-scheme:dark]'

  return (
    <form
      onSubmitCapture={recordarFormulario}
      action={formAction}
      className="space-y-6 max-w-2xl rounded-2xl border border-linea bg-panel p-5 md:p-6 text-tinta"
    >
      {state?.error && (
        <div className="p-3 bg-rojo/10 border border-rojo/30 rounded-lg flex items-start gap-3 text-rojo">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-tinta">Concepto *</label>
          <Input name="concepto" defaultValue={venta?.concepto} required disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Comprador</label>
          <Input name="comprador_nombre" defaultValue={venta?.comprador_nombre ?? ''} disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Monto ($) *</label>
          <Input name="monto" type="number" step="0.01" min="0.01" defaultValue={venta?.monto} required disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Fecha *</label>
          <Input
            name="fecha"
            type="date"
            defaultValue={venta?.fecha || new Date().toISOString().split('T')[0]}
            required
            disabled={isPending}
            className="dark:[color-scheme:dark]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Método de Pago *</label>
          <select name="metodo_pago" defaultValue={venta?.metodo_pago || 'efectivo'} required disabled={isPending} className={selectClass}>
            <OpcionesMedioPago />
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-tinta">Notas</label>
          <Input name="notas" defaultValue={venta?.notas ?? ''} disabled={isPending} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pt-4 border-t border-linea">
        <Link href="/ventas-externas" className="text-sm font-medium text-gris hover:text-tinta">
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando...' : 'Guardar venta externa'}
        </Button>
      </div>
    </form>
  )
}
