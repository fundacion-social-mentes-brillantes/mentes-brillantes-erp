'use client'

import { useActionState, useRef } from 'react'
import { saveAnticipo } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

type AnticipoFormProps = {
  asistenteId: string
  disabled?: boolean
}

export function AnticipoForm({ asistenteId, disabled = false }: AnticipoFormProps) {
  const actionWithId = saveAnticipo.bind(null, asistenteId)
  const [state, formAction, isPending] = useActionState(actionWithId, null)
  const formRef = useRef<HTMLFormElement>(null)

  if (state?.success && formRef.current) {
    formRef.current.reset()
  }

  const isLocked = disabled || isPending

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
          <p className="text-sm font-medium">Anticipo registrado correctamente.</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">Monto ($) *</label>
        <Input name="monto" type="number" step="0.01" min="0.01" required disabled={isLocked} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">Método de Pago *</label>
        <select
          name="metodo_pago"
          required
          disabled={isLocked}
          className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="efectivo">Efectivo</option>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">Fecha *</label>
        <Input
          name="fecha"
          type="date"
          defaultValue={new Date().toISOString().split('T')[0]}
          required
          disabled={isLocked}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">Notas (Opcional)</label>
        <Input name="notas" placeholder="Razón del anticipo" disabled={isLocked} />
      </div>

      {disabled && (
        <p className="text-[11px] text-[rgb(var(--text-muted))]">Solo administradores pueden registrar anticipos.</p>
      )}

      <Button type="submit" className="w-full" disabled={isLocked}>
        {isPending ? 'Procesando...' : 'Registrar Anticipo'}
      </Button>
    </form>
  )
}
