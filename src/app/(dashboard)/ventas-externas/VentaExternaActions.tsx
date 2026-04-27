'use client'

import { useTransition } from 'react'
import { Ban, Trash2 } from 'lucide-react'
import { anularVentaExterna, eliminarVentaExterna } from './actions'

export function VentaExternaActions({ id, estado }: { id: string; estado: string }) {
  const [pending, startTransition] = useTransition()

  const anular = () => {
    if (!window.confirm('¿Anular esta venta externa?')) return
    startTransition(async () => {
      const result = await anularVentaExterna(id)
      if (result?.error) alert(result.error)
      else window.location.reload()
    })
  }

  const eliminar = () => {
    if (!window.confirm('Vas a eliminar permanentemente esta venta externa. ¿Continuar?')) return
    startTransition(async () => {
      const result = await eliminarVentaExterna(id)
      if (result?.error) alert(result.error)
      else window.location.reload()
    })
  }

  return (
    <>
      {estado !== 'anulado' && (
        <button
          type="button"
          onClick={anular}
          disabled={pending}
          className="inline-flex p-2 text-zinc-400 hover:text-red-600 transition-colors rounded-md hover:bg-red-50 disabled:opacity-60"
          title="Anular"
        >
          <Ban className="w-4 h-4" />
        </button>
      )}
      <button
        type="button"
        onClick={eliminar}
        disabled={pending}
        className="inline-flex p-2 text-zinc-400 hover:text-red-600 transition-colors rounded-md hover:bg-red-50 disabled:opacity-60"
        title="Eliminar"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </>
  )
}
