'use client'

import { useActionState } from 'react'
import { saveCuenta } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { SearchableAsistenteSelect } from '@/components/SearchableAsistenteSelect'

export function CuentaForm({ asistentes }: { asistentes: any[] }) {
  const [state, formAction, isPending] = useActionState(saveCuenta, null)

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
          <label className="text-sm font-medium text-zinc-900">Asistente *</label>
          <SearchableAsistenteSelect asistentes={asistentes} disabled={isPending} />
        </div>
        
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Concepto *</label>
          <Input name="concepto" placeholder="Ej: Tratamiento mensual" required disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Valor Total ($) *</label>
          <Input name="valor_total" type="number" step="0.01" min="0.01" required disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Fecha de Emisión *</label>
          <Input name="fecha_emision" type="date" defaultValue={new Date().toISOString().split('T')[0]} required disabled={isPending} />
        </div>

        <div className="space-y-2 pt-4 border-t border-zinc-100 md:col-span-2">
          <h3 className="text-sm font-semibold text-zinc-900">Pago Inicial (Opcional)</h3>
          <p className="text-xs text-zinc-500">Si el asistente realizó un abono en este momento, regístralo aquí.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Abono Inicial ($)</label>
          <Input name="abono_inicial" type="number" step="0.01" min="0" placeholder="0.00" disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Método de Pago</label>
          <select 
            name="metodo_pago" 
            disabled={isPending}
            className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="efectivo">Efectivo</option>
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
            <option value="otro">Otro</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pt-4 border-t border-zinc-100">
        <Link href="/cuentas" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando...' : 'Crear Cuenta'}
        </Button>
      </div>
    </form>
  )
}
