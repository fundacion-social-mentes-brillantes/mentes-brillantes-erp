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
        <label className="text-sm font-medium text-zinc-900">Socio *</label>
        <select 
          name="socio_id" 
          required 
          disabled={isPending}
          className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Seleccione...</option>
          {socios.map(s => (
            <option key={s.id} value={s.id}>{s.nombre} ({s.porcentaje_participacion}%)</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">Monto ($) *</label>
        <Input name="monto" type="number" step="0.01" min="0.01" required disabled={isPending} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">Fecha *</label>
        <Input name="fecha" type="date" defaultValue={new Date().toISOString().split('T')[0]} required disabled={isPending} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">Notas</label>
        <Input name="notas" placeholder="Opcional" disabled={isPending} />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Procesando...' : 'Registrar Adelanto'}
      </Button>
    </form>
  )
}
