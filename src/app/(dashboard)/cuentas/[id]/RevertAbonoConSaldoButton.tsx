'use client'

import { useTransition } from 'react'
import { RotateCcw } from 'lucide-react'
import { revertirAbonoConSaldo } from '../actions'

export function RevertAbonoConSaldoButton({ cuentaId, abonoId }: { cuentaId: string; abonoId: string }) {
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    if (
      !window.confirm(
        'Vas a anular este abono y revertir el saldo a favor que generó. Solo procede si ese saldo a favor no se ha usado. ¿Continuar?'
      )
    )
      return

    startTransition(async () => {
      const result = await revertirAbonoConSaldo(cuentaId, abonoId)
      if (result?.error) window.alert(result.error)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      title="Anular abono y revertir su saldo a favor"
      className="p-1.5 text-gris hover:text-rojo hover:bg-rojo/10 rounded-md transition-colors disabled:opacity-50"
    >
      <RotateCcw className="w-3.5 h-3.5" />
    </button>
  )
}
