'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { crearDonacion } from '../donacionesActions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
    >
      {pending ? 'Guardando...' : 'Registrar Donación'}
    </button>
  )
}

export function DonacionForm({ asistenteId }: { asistenteId: string }) {
  const [state, action] = useFormState(async (prev: any, formData: FormData) => {
    return await crearDonacion(asistenteId, formData)
  }, null)

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600">Monto (COP)</label>
        <input
          name="monto"
          type="number"
          step="0.01"
          min="0"
          required
          className="w-full h-10 rounded-md border border-zinc-300 px-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          placeholder="Ej: 50000"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600">Método de pago</label>
        <select
          name="metodo_pago"
          required
          className="w-full h-10 rounded-md border border-zinc-300 px-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        >
          <option value="efectivo">Efectivo</option>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600">Fecha</label>
        <input
          name="fecha"
          type="date"
          className="w-full h-10 rounded-md border border-zinc-300 px-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600">Notas</label>
        <textarea
          name="notas"
          rows={2}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          placeholder="Opcional"
        />
      </div>

      {state?.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </div>
      )}

      {state?.success && (
        <div className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
          Donación registrada.
        </div>
      )}

      <SubmitButton />
    </form>
  )
}
