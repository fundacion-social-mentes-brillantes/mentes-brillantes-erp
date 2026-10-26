'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { pagarDeudasConSaldo } from '../actions'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertCircle, Coins } from 'lucide-react'

export function PagarConSaldoButton({ asistenteId, disabled }: { asistenteId: string, disabled?: boolean }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [state, setState] = useState<{ error?: string, success?: boolean } | null>(null)

  const handlePagar = () => {
    startTransition(async () => {
      setState(null)
      try {
        const result = await pagarDeudasConSaldo(asistenteId)
        setState(result)
        if (result?.success) {
          router.refresh()
        }
      } catch {
        setState({ error: 'Ocurrió un error inesperado' })
      }
    })
  }

  return (
    <div className="space-y-3 mt-4">
      {state?.error && (
        <div className="p-3 bg-rojo/10 border border-rojo/30 rounded-lg flex items-start gap-3 text-rojo">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}
      
      {state?.success && (
        <div className="p-3 bg-verde/10 border border-verde/30 rounded-lg flex items-start gap-3 text-verde">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">Deudas pagadas correctamente.</p>
        </div>
      )}

      <Button 
        onClick={handlePagar} 
        disabled={disabled || isPending} 
        className="w-full bg-verde text-fondo hover:bg-verde/90"
      >
        <Coins className="w-4 h-4 mr-2" />
        {isPending ? 'Procesando...' : 'Pagar deudas con saldo'}
      </Button>
    </div>
  )
}
