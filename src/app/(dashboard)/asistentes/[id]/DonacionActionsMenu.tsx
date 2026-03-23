'use client'

import { useState, useTransition } from 'react'
import { EllipsisVertical, Pencil, Ban, Trash2 } from 'lucide-react'
import { anularDonacionForm, editarDonacionForm, eliminarDonacionForm } from '../donacionesActions'
import { useFormState } from 'react-dom'

type Props = {
  donacion: {
    id: string
    asistente_id: string
    monto: number
    metodo_pago: string
    fecha: string
    notas?: string | null
  }
}

export function DonacionActionsMenu({ donacion }: Props) {
  const [open, setOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editState, editAction] = useFormState(editarDonacionForm, null)
  const [anularState, anularAction] = useFormState(anularDonacionForm, null)
  const [eliminarState, eliminarAction] = useFormState(eliminarDonacionForm, null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] hover:bg-[rgb(var(--surface-3))] text-[rgb(var(--text-muted))]"
        aria-label="Acciones de donación"
      >
        <EllipsisVertical className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] shadow-soft p-3 space-y-3 z-20">
          {!isEditing ? (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[rgb(var(--surface-2))] hover:bg-[rgb(var(--surface-3))] text-sm font-medium text-[rgb(var(--text-primary))]"
              >
                <Pencil className="w-4 h-4" /> Editar
              </button>
              <form action={anularAction} className="space-y-1">
                <input type="hidden" name="id" value={donacion.id} />
                <input type="hidden" name="asistente_id" value={donacion.asistente_id} />
                <button
                  type="submit"
                  className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[rgba(var(--danger),0.1)] hover:bg-[rgba(var(--danger),0.15)] text-sm font-medium text-[rgb(var(--danger))]"
                >
                  <Ban className="w-4 h-4" /> Anular
                </button>
                {anularState?.error && <p className="text-xs text-red-500">{anularState.error}</p>}
              </form>
              <form action={eliminarAction} className="space-y-1" onSubmit={(e) => {
                if (!confirm('¿Seguro que deseas eliminar esta donación de forma permanente?')) e.preventDefault()
              }}>
                <input type="hidden" name="id" value={donacion.id} />
                <input type="hidden" name="asistente_id" value={donacion.asistente_id} />
                <button
                  type="submit"
                  className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-[rgb(var(--danger))] hover:underline"
                >
                  <Trash2 className="w-4 h-4" /> Eliminar
                </button>
                {eliminarState?.error && <p className="text-xs text-red-500">{eliminarState.error}</p>}
              </form>
            </>
          ) : (
            <form action={editAction} className="space-y-2" onSubmit={() => setIsEditing(false)}>
              <input type="hidden" name="id" value={donacion.id} />
              <input type="hidden" name="asistente_id" value={donacion.asistente_id} />
              <div className="space-y-1">
                <label className="text-xs text-[rgb(var(--text-muted))]">Monto (COP)</label>
                <input
                  name="monto"
                  type="number"
                  step="0.01"
                  defaultValue={donacion.monto}
                  className="w-full h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-2 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:ring-1 focus:ring-[rgb(var(--accent))]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[rgb(var(--text-muted))]">Método</label>
                <select
                  name="metodo_pago"
                  defaultValue={donacion.metodo_pago}
                  className="w-full h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-2 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:ring-1 focus:ring-[rgb(var(--accent))]"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="nequi">Nequi</option>
                  <option value="daviplata">Daviplata</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[rgb(var(--text-muted))]">Fecha</label>
                <input
                  name="fecha"
                  type="date"
                  defaultValue={donacion.fecha}
                  className="w-full h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-2 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:ring-1 focus:ring-[rgb(var(--accent))]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[rgb(var(--text-muted))]">Notas</label>
                <textarea
                  name="notas"
                  defaultValue={donacion.notas || ''}
                  rows={2}
                  className="w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-2 py-1 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:ring-1 focus:ring-[rgb(var(--accent))]"
                />
              </div>
              {editState?.error && <p className="text-xs text-red-500">{editState.error}</p>}
              {editState?.success && <p className="text-xs text-emerald-600">Donación actualizada.</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] text-sm font-medium hover:bg-[rgb(var(--accent-strong))]"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-2 text-sm text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))]"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
