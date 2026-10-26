'use client'

import { useActionState, useEffect, useRef } from 'react'
import { saveAnticipo } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'

type AnticipoFormProps = {
  asistenteId: string
  disabled?: boolean
}

export function AnticipoForm({ asistenteId, disabled = false }: AnticipoFormProps) {
  const actionWithId = saveAnticipo.bind(null, asistenteId)
  const [state, formAction, isPending] = useActionState(actionWithId, null)
  const recordarFormulario = useConservarSiFalla(state)
  const formRef = useRef<HTMLFormElement>(null)

  // Limpiar el formulario despues de guardar. Va en un efecto: hacerlo
  // durante el render lo repetia en cada render mientras durara el exito.
  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state])

  const isLocked = disabled || isPending

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
          <p className="text-sm font-medium">Anticipo registrado correctamente.</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Monto ($) *</label>
        <Input name="monto" type="number" step="0.01" min="0.01" required disabled={isLocked} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Método de Pago *</label>
        <select
          name="metodo_pago"
          required
          disabled={isLocked}
          className="flex h-10 w-full rounded-md border border-linea bg-panel px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="efectivo">Efectivo</option>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Fecha *</label>
        <Input
          name="fecha"
          type="date"
          defaultValue={new Date().toISOString().split('T')[0]}
          required
          disabled={isLocked}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Notas (Opcional)</label>
        <Input name="notas" placeholder="Razón del anticipo" disabled={isLocked} />
      </div>

      {disabled && (
        <p className="text-xs text-gris">Solo administradores pueden registrar anticipos.</p>
      )}

      <Button type="submit" className="w-full" disabled={isLocked}>
        {isPending ? 'Procesando...' : 'Registrar Anticipo'}
      </Button>
    </form>
  )
}
