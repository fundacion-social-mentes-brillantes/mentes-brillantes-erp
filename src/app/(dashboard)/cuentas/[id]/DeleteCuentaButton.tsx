'use client'

import { useTransition, useState } from 'react'
import { deleteCuenta } from '../actions'

export function DeleteCuentaButton({ cuentaId }: { cuentaId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleDelete = () => {
    if (!window.confirm('¿Seguro que deseas eliminar esta cuenta? Esta acción no se puede deshacer.')) return
    startTransition(async () => {
      setError(null)
      const result = await deleteCuenta(cuentaId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
      >
        {isPending ? 'Eliminando...' : 'Eliminar cuenta'}
      </button>
    </div>
  )
}
