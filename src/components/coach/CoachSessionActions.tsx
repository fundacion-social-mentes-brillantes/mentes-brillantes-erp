'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { editarSesion, eliminarSesion } from '@/app/(dashboard)/coach/actions'

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-md bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] px-3 py-1.5 text-xs font-medium hover:bg-[rgb(var(--accent-strong))] disabled:opacity-60"
    >
      {pending ? 'Guardando...' : label}
    </button>
  )
}

export function CoachSessionActions({ sesionId, fecha, notas }: { sesionId: string; fecha: string; notas?: string | null }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteState, deleteAction] = useFormState(eliminarSesion, null)
  const [editState, editAction] = useFormState(editarSesion, null)

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setEditOpen((v) => !v)}
        className="text-xs text-[rgb(var(--info))] hover:underline"
      >
        {editOpen ? 'Cerrar edición' : 'Editar'}
      </button>

      {editOpen && (
        <form action={editAction} className="space-y-2 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3">
          <input type="hidden" name="sesion_id" value={sesionId} />
          <div className="space-y-1">
            <label className="text-xs text-[rgb(var(--text-muted))]">Fecha</label>
            <input
              type="date"
              name="fecha"
              defaultValue={fecha}
              className="w-full h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-2 text-sm text-[rgb(var(--text-primary))]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[rgb(var(--text-muted))]">Notas</label>
            <textarea
              name="notas"
              defaultValue={notas || ''}
              rows={2}
              className="w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-2 py-1 text-sm text-[rgb(var(--text-primary))]"
            />
          </div>
          {editState?.error && <p className="text-xs text-[rgb(var(--danger))]">{editState.error}</p>}
          {editState?.success && <p className="text-xs text-[rgb(var(--success))]">Sesión actualizada.</p>}
          <SubmitBtn label="Guardar cambios" />
        </form>
      )}

      <form
        action={deleteAction}
        onSubmit={(e) => {
          if (!confirm('¿Eliminar esta sesión?')) e.preventDefault()
        }}
        className="inline-block"
      >
        <input type="hidden" name="sesion_id" value={sesionId} />
        <button type="submit" className="text-xs text-[rgb(var(--danger))] hover:underline">
          Eliminar
        </button>
        {deleteState?.error && <p className="text-xs text-[rgb(var(--danger))]">{deleteState.error}</p>}
        {deleteState?.success && <p className="text-xs text-[rgb(var(--success))]">Sesión eliminada.</p>}
      </form>
    </div>
  )
}
