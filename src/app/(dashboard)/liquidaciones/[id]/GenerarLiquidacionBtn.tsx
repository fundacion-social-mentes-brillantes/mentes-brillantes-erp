'use client'

import { useState } from 'react'
import { generarLiquidacion } from '../actions'
import { Button } from '@/components/ui/button'
import { Calculator } from 'lucide-react'

export function GenerarLiquidacionBtn({ periodoId }: { periodoId: string }) {
  const [isPending, setIsPending] = useState(false)

  const handleGenerar = async () => {
    if (!confirm('¿Estás seguro de cerrar este período y generar la liquidación final? Esta acción no se puede deshacer y no podrás agregar más adelantos.')) {
      return
    }
    
    setIsPending(true)
    await generarLiquidacion(periodoId)
    setIsPending(false)
  }

  return (
    <Button 
      onClick={handleGenerar} 
      disabled={isPending}
      className="w-full sm:w-auto bg-zinc-900 text-white hover:bg-zinc-800"
    >
      <Calculator className="w-4 h-4 mr-2" />
      {isPending ? 'Generando...' : 'Cerrar Período y Liquidar'}
    </Button>
  )
}
