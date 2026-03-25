'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Edit2, X } from 'lucide-react'
import { editValorCuenta, editMontoAbono } from '../actions'

function ModalShell({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Cerrar modal"
      />
      <div className="relative w-full max-w-lg bg-[rgb(var(--surface-1))] rounded-xl shadow-2xl border border-[rgb(var(--border))]">
        <div className="flex justify-between items-center p-4 border-b border-[rgb(var(--border))]">
          <h3 className="font-semibold text-[rgb(var(--text-primary))]">{title}</h3>
          <button onClick={onClose} className="text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  )
}

export function EditValorModal({ cuentaId, valorActual }: { cuentaId: string, valorActual: number }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await editValorCuenta(cuentaId, valorActual, null, formData)
      if (result?.error) setError(result.error)
      else setIsOpen(false)
    })
  }

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Editar valor total">
        <Edit2 className="w-4 h-4" />
      </button>

      <ModalShell open={isOpen} onClose={() => setIsOpen(false)} title="Editar Valor Total">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--text-primary))] mb-1">Nuevo Valor Total</label>
            <input type="number" name="valor_nuevo" defaultValue={valorActual} required min="1" step="1" className="w-full rounded-md border border-[rgb(var(--border))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--text-primary))] mb-1">Motivo de la corrección</label>
            <textarea name="motivo" required rows={2} className="w-full rounded-md border border-[rgb(var(--border))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" placeholder="Ej: Error de digitación al crear la cuenta"></textarea>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-medium text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-2))] rounded-md">Cancelar</button>
            <button type="submit" disabled={isPending} className="px-4 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] bg-[rgb(var(--accent))] hover:bg-[rgb(var(--accent-strong))] rounded-md disabled:opacity-50">Guardar Cambios</button>
          </div>
        </form>
      </ModalShell>
    </>
  )
}

export function EditAbonoModal({ abonoId, cuentaId, valorActual }: { abonoId: string, cuentaId: string, valorActual: number }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await editMontoAbono(abonoId, cuentaId, valorActual, null, formData)
      if (result?.error) setError(result.error)
      else setIsOpen(false)
    })
  }

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Editar monto del abono">
        <Edit2 className="w-3.5 h-3.5" />
      </button>

      <ModalShell open={isOpen} onClose={() => setIsOpen(false)} title="Editar Monto de Abono">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--text-primary))] mb-1">Nuevo Monto</label>
            <input type="number" name="valor_nuevo" defaultValue={valorActual} required min="1" step="1" className="w-full rounded-md border border-[rgb(var(--border))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--text-primary))] mb-1">Motivo de la corrección</label>
            <textarea name="motivo" required rows={2} className="w-full rounded-md border border-[rgb(var(--border))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" placeholder="Ej: Se registró un monto incorrecto"></textarea>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-medium text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-2))] rounded-md">Cancelar</button>
            <button type="submit" disabled={isPending} className="px-4 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] bg-[rgb(var(--accent))] hover:bg-[rgb(var(--accent-strong))] rounded-md disabled:opacity-50">Guardar Cambios</button>
          </div>
        </form>
      </ModalShell>
    </>
  )
}
