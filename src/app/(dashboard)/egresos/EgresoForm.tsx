'use client'

import { useActionState } from 'react'
import { saveEgreso } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import type { Tables } from '@/lib/supabase/types'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'

export function EgresoForm({ egreso }: { egreso?: Tables<'egresos'> | null }) {
  const actionWithId = saveEgreso.bind(null, egreso?.id || null)
  const [state, formAction, isPending] = useActionState(actionWithId, null)
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
          <Input
            name="concepto"
            defaultValue={egreso?.concepto}
            placeholder="Ej: Pago de arriendo"
            required
            disabled={isPending}
            className="bg-panel text-tinta"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Monto ($) *</label>
          <Input
            name="monto"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={egreso?.monto}
            required
            disabled={isPending}
            className="bg-panel text-tinta"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Fecha *</label>
          <Input
            name="fecha"
            type="date"
            defaultValue={egreso?.fecha || new Date().toISOString().split('T')[0]}
            required
            disabled={isPending}
            className="bg-panel text-tinta dark:[color-scheme:dark]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Categoría *</label>
          <select name="categoria" defaultValue={egreso?.categoria || ''} required disabled={isPending} className={selectClass}>
            <option value="">Seleccione...</option>
            <option value="Operativo">Operativo</option>
            <option value="Administrativo">Administrativo</option>
            <option value="Insumos">Insumos</option>
            <option value="Servicios">Servicios Básicos</option>
            <option value="Honorarios">Honorarios</option>
            <option value="Otros">Otros</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Método de Pago *</label>
          <select
            name="metodo_pago"
            defaultValue={egreso?.metodo_pago || 'efectivo'}
            required
            disabled={isPending}
            className={selectClass}
          >
            <option value="efectivo">Efectivo</option>
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
            <option value="otro">Otro</option>
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-tinta">Notas (Opcional)</label>
          <Input
            name="notas"
            defaultValue={egreso?.notas ?? ''}
            placeholder="Referencia o detalle adicional"
            disabled={isPending}
            className="bg-panel text-tinta"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pt-4 border-t border-linea">
        <Link
          href="/egresos"
          className="text-sm font-medium text-gris hover:text-tinta"
        >
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando...' : 'Guardar Egreso'}
        </Button>
      </div>
    </form>
  )
}

