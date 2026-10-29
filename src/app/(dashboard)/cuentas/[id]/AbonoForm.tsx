'use client'

import { useActionState, useEffect, useRef } from 'react'
import { saveAbono } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { pesos } from '@/lib/utils/pesos'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'
import { OpcionesMedioPago } from '@/components/medios-pago/MediosPago'

export type AbonoActionState = Awaited<ReturnType<typeof saveAbono>>

export function AbonoForm({ cuentaId, maxMonto }: { cuentaId: string; maxMonto: number }) {
  const actionWithId = (state: AbonoActionState, formData: FormData) => saveAbono(cuentaId, state, formData)
  const [state, formAction, isPending] = useActionState<AbonoActionState, FormData>(actionWithId, null)
  const recordarFormulario = useConservarSiFalla(state)
  const formRef = useRef<HTMLFormElement>(null)

  // Limpiar el formulario despues de guardar. Va en un efecto: hacerlo
  // durante el render lo repetia en cada render mientras durara el exito.
  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state])

  return (
    <form ref={formRef} onSubmitCapture={recordarFormulario} action={formAction} className="space-y-4">
      {state?.error && (
        <div className="flex items-start gap-3 rounded-lg border border-rojo/30 bg-rojo/10 p-3 text-rojo">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      {state?.success && (
        <div className="flex items-start gap-3 rounded-lg border border-verde/30 bg-verde/10 p-3 text-verde">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">Abono registrado correctamente.</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Monto ($) *</label>
        <Input
          name="monto"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={maxMonto}
          required
          disabled={isPending}
        />
        <p className="text-xs text-gris">
          Saldo pendiente actual: {pesos(maxMonto)}. Si el pago supera ese valor, el excedente quedará
          como saldo a favor.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Método de pago *</label>
        <select
          name="metodo_pago"
          required
          disabled={isPending}
          className="flex h-10 w-full rounded-2xl border border-linea bg-panel px-3 py-2 text-sm text-tinta ring-offset-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:[color-scheme:dark]"
        >
          <OpcionesMedioPago />
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Fecha de Pago *</label>
        <Input
          name="fecha_pago"
          type="date"
          defaultValue={new Date().toISOString().split('T')[0]}
          required
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Notas (Opcional)</label>
        <Input name="notas" placeholder="Referencia o detalle" disabled={isPending} />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Procesando...' : 'Registrar Abono'}
      </Button>
    </form>
  )
}
