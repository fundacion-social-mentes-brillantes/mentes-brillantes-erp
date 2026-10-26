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
      className="inline-flex p-2 transition-colors rounded-md text-gris hover:text-rojo hover:bg-rojo/10 disabled:opacity-50"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}
