'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { registrarSesion } from '@/app/(dashboard)/coach/actions'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      className="inline-flex items-center justify-center rounded-md bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] px-4 py-2 text-sm font-medium hover:bg-[rgb(var(--accent-strong))] disabled:opacity-60"
      disabled={pending}
    >
      {pending ? 'Guardando...' : 'Registrar sesión'}
    </button>
  )
}

export function RegisterCoachSessionForm({ paqueteId, disabled }: { paqueteId: string; disabled?: boolean }) {
  const [state, formAction] = useFormState(registrarSesion, null)

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="paquete_id" value={paqueteId} />
      <div className="space-y-1">
        <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Fecha</label>
        <input
          type="date"
          name="fecha"
          defaultValue={new Date().toISOString().split('T')[0]}
          className="w-full h-10 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 text-sm"
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Notas (opcional)</label>
        <textarea
          name="notas"
          rows={2}
          className="w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 py-2 text-sm"
          placeholder="Observaciones breves"
          disabled={disabled}
        />
      </div>
      {state?.error && <p className="text-xs text-[rgb(var(--danger))]">{state.error}</p>}
      {state?.success && <p className="text-xs text-[rgb(var(--success))]">Sesión registrada.</p>}
      <Submit />
    </form>
  )
}
