'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { crearDonacion } from '../donacionesActions'

function SubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] px-4 py-2 text-sm font-medium hover:bg-[rgb(var(--accent-strong))] transition-colors disabled:opacity-60"
    >
      {pending ? 'Guardando...' : 'Registrar Donación'}
    </button>
  )
}

type DonacionFormProps = {
  asistenteId: string
  disabled?: boolean
}

export function DonacionForm({ asistenteId, disabled = false }: DonacionFormProps) {
  const [state, action] = useFormState(async (_prev: any, formData: FormData) => {
    return await crearDonacion(asistenteId, formData)
  }, null)

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Monto (COP)</label>
        <input
          name="monto"
          type="number"
          step="0.01"
          min="0"
          required
          disabled={disabled}
          className="w-full h-10 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:ring-1 focus:ring-[rgb(var(--accent))]"
          placeholder="Ej: 50000"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Método de pago</label>
        <select
          name="metodo_pago"
          required
          disabled={disabled}
          className="w-full h-10 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:ring-1 focus:ring-[rgb(var(--accent))]"
        >
          <option value="efectivo">Efectivo</option>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Fecha</label>
        <input
          name="fecha"
          type="date"
          disabled={disabled}
          className="w-full h-10 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:ring-1 focus:ring-[rgb(var(--accent))]"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Notas</label>
        <textarea
          name="notas"
          rows={2}
          disabled={disabled}
          className="w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 py-2 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:ring-1 focus:ring-[rgb(var(--accent))]"
          placeholder="Opcional"
        />
      </div>

      {state?.error && (
        <div className="text-sm text-[rgb(var(--danger))] bg-[rgba(var(--danger),0.1)] border border-[rgba(var(--danger),0.25)] rounded-md px-3 py-2">
          {state.error}
        </div>
      )}

      {state?.success && (
        <div className="text-sm text-[rgb(var(--accent))] bg-[rgba(var(--accent),0.1)] border border-[rgba(var(--accent),0.25)] rounded-md px-3 py-2">
          Donación registrada.
        </div>
      )}

      {disabled && (
        <p className="text-[11px] text-[rgb(var(--text-muted))]">Solo administradores pueden registrar donaciones.</p>
      )}

      <SubmitButton disabled={disabled} />
    </form>
  )
}
