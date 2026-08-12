'use client'

import { useActionState, useRef } from 'react'
import { saveDevolucionAdelanto } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

/**
 * Registra que el socio devolvio plata de un adelanto: toda de una o de a
 * poquitos. No es un ingreso nuevo, es el mismo adelanto bajando, asi que se
 * descuenta solo de la liquidacion.
 */
export function DevolucionAdelantoForm({
  adelantoId,
  pendiente,
  fechaMinima,
  fechaMaxima,
  fechaSugerida,
}: {
  adelantoId: string
  pendiente: number
  fechaMinima: string
  fechaMaxima: string
  fechaSugerida: string
}) {
  const actionWithId = saveDevolucionAdelanto.bind(null, adelantoId)
  const [state, formAction, isPending] = useActionState(actionWithId, null)
  const formRef = useRef<HTMLFormElement>(null)
  const selectClass =
    "flex h-9 w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 py-1.5 text-sm text-[rgb(var(--text-primary))] ring-offset-[rgb(var(--surface-1))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:[color-scheme:dark]"

  if (state?.success && formRef.current) {
    formRef.current.reset()
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3 pt-3">
      {state?.error && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-xs font-medium">{state.error}</p>
        </div>
      )}

      {state?.success && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2 text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-xs font-medium">Devolución registrada.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-[rgb(var(--text-primary))]">Monto devuelto *</label>
          <Input
            name="monto"
            type="number"
            step="0.01"
            min="0.01"
            max={pendiente}
            required
            disabled={isPending}
            placeholder={String(pendiente)}
            className="h-9 bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-[rgb(var(--text-primary))]">Fecha *</label>
          <Input
            name="fecha"
            type="date"
            defaultValue={fechaSugerida}
            min={fechaMinima}
            max={fechaMaxima}
            required
            disabled={isPending}
            className="h-9 bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))] dark:[color-scheme:dark]"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-[rgb(var(--text-primary))]">¿Cómo devolvió?</label>
        <select name="metodo_pago" required disabled={isPending} className={selectClass}>
          <option value="efectivo">Efectivo</option>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-[rgb(var(--text-primary))]">Notas</label>
        <Input
          name="notas"
          placeholder="Opcional"
          disabled={isPending}
          className="h-9 bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))]"
        />
      </div>

      <Button type="submit" variant="outline" className="w-full" disabled={isPending}>
        {isPending ? 'Registrando...' : 'Registrar devolución'}
      </Button>
    </form>
  )
}
