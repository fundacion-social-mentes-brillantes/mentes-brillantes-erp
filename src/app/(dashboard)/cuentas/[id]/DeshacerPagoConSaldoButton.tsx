'use client'

import { useTransition } from 'react'
import { Undo2 } from 'lucide-react'
import { deshacerPagoConSaldo } from '../actions'

// Anula un pago hecho CON saldo a favor y le devuelve ese saldo a la persona.
export function DeshacerPagoConSaldoButton({ cuentaId, abonoId }: { cuentaId: string; abonoId: string }) {
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    if (
      !window.confirm(
        'Vas a deshacer este pago hecho con saldo a favor: el pago queda anulado, la deuda de la cuenta vuelve a subir y el saldo regresa a la persona. ¿Continuar?'
      )
    )
      return

    startTransition(async () => {
      const result = await deshacerPagoConSaldo(cuentaId, abonoId)
      if (result?.error) window.alert(result.error)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      title="Deshacer el pago y devolver el saldo a favor"
      aria-label="Deshacer el pago y devolver el saldo a favor"
      className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
    >
      <Undo2 className="w-3.5 h-3.5" />
    </button>
  )
}
