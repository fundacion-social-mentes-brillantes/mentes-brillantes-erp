'use client'

import { Trash2 } from 'lucide-react'
import { useTransition } from 'react'
import { deleteEgreso } from './actions'

export function DeleteEgresoButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (window.confirm('¿Estás seguro de eliminar este egreso? Esta acción no se puede deshacer.')) {
      startTransition(async () => {
        const result = await deleteEgreso(id)
        if (result?.error) {
          alert(result.error)
        }
      })
    }
  }

  return (
    <button 
      onClick={handleDelete}
      disabled={isPending}
      title="Eliminar egreso"
      className="inline-flex p-2 transition-colors rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}
