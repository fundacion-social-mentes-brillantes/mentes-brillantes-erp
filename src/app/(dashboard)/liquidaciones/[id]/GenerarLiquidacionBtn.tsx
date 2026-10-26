'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generarLiquidacion } from '../actions'
import { Button } from '@/components/ui/button'
import { Calculator } from 'lucide-react'

export function GenerarLiquidacionBtn({ periodoId }: { periodoId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleGenerar = () => {
    if (!confirm('¿Estás seguro de cerrar este período y generar la liquidación final? Esta acción no se puede deshacer y no podrás agregar más adelantos.')) {
      return
    }

    setError(null)
    startTransition(() => {
      void (async () => {
        const result = await generarLiquidacion(periodoId)
        if (result?.error) {
          setError(result.error)
          return
        }
        router.refresh()
      })()
    })
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleGenerar}
        disabled={isPending}
        className="w-full sm:w-auto bg-acento text-sobre-acento hover:bg-acento-fuerte"
      >
        <Calculator className="w-4 h-4 mr-2" />
        {isPending ? 'Generando...' : 'Cerrar Período y Liquidar'}
      </Button>
      {error && <p className="text-sm text-rojo">{error}</p>}
    </div>
  )
}
