'use client'

import { useActionState, useRef } from 'react'
import { aplicarSaldoFavor, ActionState } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2, Wallet } from 'lucide-react'

export function AplicarSaldoForm({ cuentaId, asistenteId, maxMonto }: { cuentaId: string, asistenteId: string, maxMonto: number }) {
  const actionWithArgs = (state: ActionState, formData: FormData) =>
    aplicarSaldoFavor(cuentaId, asistenteId, maxMonto.toString(), state, formData)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(actionWithArgs, null)
  const formRef = useRef<HTMLFormElement>(null)

  if (state?.success && formRef.current) {
    formRef.current.reset()
  }

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
          <p className="text-sm font-medium">Saldo aplicado correctamente.</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">Monto a aplicar ($)</label>
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
        <p className="text-xs text-zinc-500">Máximo aplicable: ${maxMonto.toLocaleString()}</p>
      </div>

      <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={isPending}>
        <Wallet className="w-4 h-4 mr-2" />
        {isPending ? 'Aplicando...' : 'Pagar con Saldo a Favor'}
      </Button>
    </form>
  )
}
