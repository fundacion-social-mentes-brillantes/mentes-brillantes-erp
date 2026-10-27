'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { eliminarTallerAction } from '../../actions'

/** Solo borra un taller vacío; si tiene gente o gastos, la acción lo dice y no borra nada. */
export function BorrarTaller({ tallerId }: { tallerId: string }) {
  const [enviando, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const borrar = () => {
    if (!window.confirm('¿Borrar este taller? Solo se puede si no tiene personas ni gastos.')) return
    setError(null)
    iniciar(async () => {
      const r = await eliminarTallerAction(tallerId)
      if (r?.error) setError(r.error)
    })
  }

  return (
    <div className="max-w-3xl space-y-2">
      <button
        type="button"
        onClick={borrar}
        disabled={enviando}
        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rojo transition-colors hover:bg-rojo/10 disabled:opacity-60"
      >
        <Trash2 className="h-4 w-4" />
        {enviando ? 'Borrando…' : 'Borrar taller'}
      </button>
      {error && (
        <p className="text-sm text-rojo" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
