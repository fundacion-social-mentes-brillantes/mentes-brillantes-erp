'use client'

import { useActionState, useEffect, useRef } from 'react'
import { saveAdelanto } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { Tables } from '@/lib/supabase/types'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'
import { OpcionesMedioPago } from '@/components/medios-pago/MediosPago'

export function AdelantoForm({ periodoId, socios }: { periodoId: string, socios: Array<Pick<Tables<'socios'>, 'id' | 'nombre' | 'porcentaje_participacion'>> }) {
  const actionWithId = saveAdelanto.bind(null, periodoId)
  const [state, formAction, isPending] = useActionState(actionWithId, null)
  const recordarFormulario = useConservarSiFalla(state)
  const formRef = useRef<HTMLFormElement>(null)
  const selectClass =
    "flex h-10 w-full rounded-md border border-linea bg-panel px-3 py-2 text-sm text-tinta ring-offset-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:[color-scheme:dark]"

  // Limpiar el formulario despues de guardar. Va en un efecto: hacerlo
  // durante el render lo repetia en cada render mientras durara el exito.
  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state])

  return (
    <form ref={formRef} onSubmitCapture={recordarFormulario} action={formAction} className="space-y-4">
      {state?.error && (
        <div className="p-3 bg-rojo/10 border border-rojo/30 rounded-lg flex items-start gap-3 text-rojo">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}
      
      {state?.success && (
        <div className="p-3 bg-verde/10 border border-verde/30 rounded-lg flex items-start gap-3 text-verde">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">Adelanto registrado.</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Socio *</label>
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
        <label className="text-sm font-medium text-tinta">Monto ($) *</label>
        <MoneyInput name="monto" required disabled={isPending}
          className="bg-panel text-tinta" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Fecha *</label>
        <Input name="fecha" type="date" defaultValue={new Date().toISOString().split('T')[0]} required disabled={isPending}
          className="bg-panel text-tinta dark:[color-scheme:dark]" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Método de Pago *</label>
        <select
          name="metodo_pago"
          required
          disabled={isPending}
          className={selectClass}
        >
          <OpcionesMedioPago />
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Notas</label>
        <Input name="notas" placeholder="Opcional" disabled={isPending}
          className="bg-panel text-tinta" />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Procesando...' : 'Registrar Adelanto'}
      </Button>
    </form>
  )
}
