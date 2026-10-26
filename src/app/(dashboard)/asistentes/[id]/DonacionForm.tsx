'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { crearDonacion } from '../donacionesActions'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'

function SubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-acento text-sobre-acento px-4 py-2 text-sm font-medium hover:bg-acento-fuerte transition-colors disabled:opacity-60"
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
  const [state, action] = useFormState(async (_prev: unknown, formData: FormData) => {
    return await crearDonacion(asistenteId, formData)
  }, null)
  const recordarFormulario = useConservarSiFalla(state)

  return (
    <form onSubmitCapture={recordarFormulario} action={action} className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium text-gris">Monto (COP)</label>
        <input
          name="monto"
          type="number"
          step="0.01"
          min="0"
          required
          disabled={disabled}
          className="w-full h-10 rounded-md border border-linea bg-panel px-3 text-sm text-tinta focus:border-acento focus:ring-1 focus:ring-acento"
          placeholder="Ej: 50000"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-gris">Método de pago</label>
        <select
          name="metodo_pago"
          required
          disabled={disabled}
          className="w-full h-10 rounded-md border border-linea bg-panel px-3 text-sm text-tinta focus:border-acento focus:ring-1 focus:ring-acento"
        >
          <option value="efectivo">Efectivo</option>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-gris">Fecha</label>
        <input
          name="fecha"
          type="date"
          disabled={disabled}
          className="w-full h-10 rounded-md border border-linea bg-panel px-3 text-sm text-tinta focus:border-acento focus:ring-1 focus:ring-acento"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-gris">Notas</label>
        <textarea
          name="notas"
          rows={2}
          disabled={disabled}
          className="w-full rounded-md border border-linea bg-panel px-3 py-2 text-sm text-tinta focus:border-acento focus:ring-1 focus:ring-acento"
          placeholder="Opcional"
        />
      </div>

      {state?.error && (
        <div className="text-sm text-rojo bg-rojo/10 border border-rojo/25 rounded-md px-3 py-2">
          {state.error}
        </div>
      )}

      {state?.success && (
        <div className="text-sm text-acento bg-acento/10 border border-acento/25 rounded-md px-3 py-2">
          Donación registrada.
        </div>
      )}

      {disabled && (
        <p className="text-xs text-gris">Solo administradores pueden registrar donaciones.</p>
      )}

      <SubmitButton disabled={disabled} />
    </form>
  )
}
