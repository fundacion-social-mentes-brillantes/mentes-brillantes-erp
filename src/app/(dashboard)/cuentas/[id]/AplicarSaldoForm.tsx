'use client'

import { useActionState, useEffect, useRef } from 'react'
import { aplicarSaldoFavor, ActionState } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2, Wallet } from 'lucide-react'
import { pesos } from '@/lib/utils/pesos'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'

export function AplicarSaldoForm({ cuentaId, asistenteId, maxMonto }: { cuentaId: string, asistenteId: string, maxMonto: number }) {
  const actionWithArgs = (state: ActionState, formData: FormData) =>
    aplicarSaldoFavor(cuentaId, asistenteId, maxMonto.toString(), state, formData)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(actionWithArgs, null)
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
        <div className="p-3 bg-rojo/10 border border-rojo/30 rounded-lg flex items-start gap-3 text-rojo">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}
      
      {state?.success && (
        <div className="p-3 bg-verde/10 border border-verde/30 rounded-lg flex items-start gap-3 text-verde">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">Saldo aplicado correctamente.</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Monto a aplicar ($)</label>
        <Input 
          name="monto" 
          type="number" 
          step="0.01" 
          min="0.01" 
          max={maxMonto} 
          defaultValue={maxMonto}
          required 
          disabled={isPending} 
        />
        <p className="text-xs text-gris">Máximo aplicable: {pesos(maxMonto)}</p>
      </div>

      <Button type="submit" className="w-full bg-verde text-fondo hover:bg-verde/90" disabled={isPending}>
        <Wallet className="w-4 h-4 mr-2" />
        {isPending ? 'Aplicando...' : 'Pagar con Saldo a Favor'}
      </Button>
    </form>
  )
}
