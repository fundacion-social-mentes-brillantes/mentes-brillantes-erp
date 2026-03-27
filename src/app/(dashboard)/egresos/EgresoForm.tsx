'use client'

import { useActionState } from 'react'
import { saveEgreso } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'

export function EgresoForm({ egreso }: { egreso?: any }) {
  const actionWithId = saveEgreso.bind(null, egreso?.id || null)
  const [state, formAction, isPending] = useActionState(actionWithId, null)

  const selectClass =
    'flex h-10 w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 py-2 text-sm text-[rgb(var(--text-primary))] ring-offset-[rgb(var(--surface-1))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:[color-scheme:dark]'

  return (
    <form
      action={formAction}
      className="space-y-6 max-w-2xl bg-[rgb(var(--surface-1))] p-6 rounded-xl border border-[rgb(var(--border))] shadow-sm text-[rgb(var(--text-primary))]"
    >
      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-600">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Concepto *</label>
          <Input
            name="concepto"
            defaultValue={egreso?.concepto}
            placeholder="Ej: Pago de arriendo"
            required
            disabled={isPending}
            className="bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Monto ($) *</label>
          <Input
            name="monto"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={egreso?.monto}
            required
            disabled={isPending}
            className="bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Fecha *</label>
          <Input
            name="fecha"
            type="date"
            defaultValue={egreso?.fecha || new Date().toISOString().split('T')[0]}
            required
            disabled={isPending}
            className="bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))] dark:[color-scheme:dark]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Categoría *</label>
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
          <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Método de Pago *</label>
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
          <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Notas (Opcional)</label>
          <Input
            name="notas"
            defaultValue={egreso?.notas}
            placeholder="Referencia o detalle adicional"
            disabled={isPending}
            className="bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))]"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pt-4 border-t border-[rgb(var(--border))]">
        <Link
          href="/egresos"
          className="text-sm font-medium text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))]"
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

