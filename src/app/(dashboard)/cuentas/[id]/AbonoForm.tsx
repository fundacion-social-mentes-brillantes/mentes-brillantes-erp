'use client'

import { useActionState, useRef } from 'react'
import { saveAbono } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

export type AbonoActionState = Awaited<ReturnType<typeof saveAbono>>

export function AbonoForm({ cuentaId, maxMonto }: { cuentaId: string; maxMonto: number }) {
  const actionWithId = (state: AbonoActionState, formData: FormData) => saveAbono(cuentaId, state, formData)
  const [state, formAction, isPending] = useActionState<AbonoActionState, FormData>(actionWithId, null)
  const formRef = useRef<HTMLFormElement>(null)

  if (state?.success && formRef.current) {
    formRef.current.reset()
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {state?.error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-600">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      {state?.success && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">Abono registrado correctamente.</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">Monto ($) *</label>
        <Input
          name="monto"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={maxMonto}
          required
          disabled={isPending}
        />
        <p className="text-xs text-zinc-500">
          Saldo pendiente actual: ${maxMonto.toLocaleString()}. Si el pago supera ese valor, el excedente quedara
          como saldo a favor.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">Metodo de Pago *</label>
        <select
          name="metodo_pago"
          required
          disabled={isPending}
          className="flex h-10 w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2 text-sm text-[rgb(var(--text-primary))] ring-offset-[rgb(var(--surface-1))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:[color-scheme:dark]"
        >
          <option value="efectivo">Efectivo</option>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">Fecha de Pago *</label>
        <Input
          name="fecha_pago"
          type="date"
          defaultValue={new Date().toISOString().split('T')[0]}
          required
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">Notas (Opcional)</label>
        <Input name="notas" placeholder="Referencia o detalle" disabled={isPending} />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Procesando...' : 'Registrar Abono'}
      </Button>
    </form>
  )
}
