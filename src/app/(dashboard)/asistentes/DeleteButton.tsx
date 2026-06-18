'use client'

import { Trash2 } from 'lucide-react'
import { useTransition } from 'react'
import { deleteAsistente } from './actions'

export function DeleteButton({ id, nombre }: { id: string, nombre: string }) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar permanentemente a ${nombre}?\n\nADVERTENCIA: Esta acción no se puede deshacer y se perderá el historial asociado si no tiene cuentas vinculadas.`)) {
      startTransition(async () => {
        const result = await deleteAsistente(id)
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
      title="Eliminar asistente"
      className="inline-flex p-2 rounded-md transition-colors text-[rgb(var(--text-muted))] hover:text-[rgb(var(--danger))] hover:bg-[rgb(var(--surface-2))] disabled:opacity-50"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}
