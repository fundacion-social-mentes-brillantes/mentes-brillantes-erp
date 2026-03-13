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

  return (
    <form action={formAction} className="space-y-6 max-w-2xl bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-600">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Concepto *</label>
          <Input name="concepto" defaultValue={egreso?.concepto} placeholder="Ej: Pago de arriendo" required disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Monto ($) *</label>
          <Input name="monto" type="number" step="0.01" min="0.01" defaultValue={egreso?.monto} required disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Fecha *</label>
          <Input name="fecha" type="date" defaultValue={egreso?.fecha || new Date().toISOString().split('T')[0]} required disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Categoría *</label>
          <select 
            name="categoria" 
            defaultValue={egreso?.categoria || ''}
            required 
            disabled={isPending}
            className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
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
          <label className="text-sm font-medium text-zinc-900">Método de Pago *</label>
          <select 
            name="metodo_pago" 
            defaultValue={egreso?.metodo_pago || 'efectivo'}
            required 
            disabled={isPending}
            className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="efectivo">Efectivo</option>
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
            <option value="otro">Otro</option>
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Notas (Opcional)</label>
          <Input name="notas" defaultValue={egreso?.notas} placeholder="Referencia o detalle adicional" disabled={isPending} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pt-4 border-t border-zinc-100">
        <Link href="/egresos" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando...' : 'Guardar Egreso'}
        </Button>
      </div>
    </form>
  )
}
