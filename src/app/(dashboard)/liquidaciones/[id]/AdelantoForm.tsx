'use client'

import { useActionState, useRef } from 'react'
import { saveAdelanto } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

export function AdelantoForm({ periodoId, socios }: { periodoId: string, socios: any[] }) {
  const actionWithId = saveAdelanto.bind(null, periodoId)
  const [state, formAction, isPending] = useActionState(actionWithId, null)
  const formRef = useRef<HTMLFormElement>(null)
  const selectClass =
    "flex h-10 w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 py-2 text-sm text-[rgb(var(--text-primary))] ring-offset-[rgb(var(--surface-1))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:[color-scheme:dark]"

  if (state?.success && formRef.current) {
    formRef.current.reset()
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-600">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}
      
      {state?.success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3 text-emerald-700">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">Adelanto registrado.</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Socio *</label>
        <select
          name="socio_id"
          required
          disabled={isPending}
          className={selectClass}
        >
          <option value="">Seleccione...</option>
          {socios.map(s => (
            <option key={s.id} value={s.id}>{s.nombre} ({s.porcentaje_participacion}%)</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Monto ($) *</label>
        <Input name="monto" type="number" step="0.01" min="0.01" required disabled={isPending}
          className="bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))]" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Fecha *</label>
        <Input name="fecha" type="date" defaultValue={new Date().toISOString().split('T')[0]} required disabled={isPending}
          className="bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))] dark:[color-scheme:dark]" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Método de Pago *</label>
        <select
          name="metodo_pago"
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

      <div className="space-y-2">
        <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Notas</label>
        <Input name="notas" placeholder="Opcional" disabled={isPending}
          className="bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))]" />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Procesando...' : 'Registrar Adelanto'}
      </Button>
    </form>
  )
}
