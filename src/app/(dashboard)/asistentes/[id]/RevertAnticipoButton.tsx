'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { revertirAnticipo } from '../actions'

export function RevertAnticipoButton({
  asistenteId,
  anticipoId,
  disabled = false,
}: {
  asistenteId: string
  anticipoId: string
  disabled?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    if (disabled || isPending) return
    const confirmado = window.confirm(
      'Esta reversión anulará contablemente el anticipo original y creará un movimiento compensatorio. ¿Deseas continuar?'
    )
    if (!confirmado) return

    setError(null)
    startTransition(async () => {
      const result = await revertirAnticipo(asistenteId, anticipoId)
      if (result?.error) {
        setError(result.error)
        return
      }
      window.location.reload()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isPending}
        className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {isPending ? 'Revirtiendo...' : 'Revertir anticipo'}
      </button>
      {error && (
        <p className="max-w-[220px] text-right text-[11px] text-red-600 flex items-start justify-end gap-1">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
