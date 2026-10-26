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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Cerrar modal"
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-linea bg-panel shadow-strong">
        <div className="flex justify-between items-center p-4 border-b border-linea">
          <h3 className="font-semibold text-tinta">{title}</h3>
          <button onClick={onClose} className="text-gris hover:text-tinta">
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
      <button onClick={() => setIsOpen(true)} className="p-1.5 text-gris hover:text-info hover:bg-info/10 rounded-md transition-colors" title="Editar valor total">
        <Edit2 className="w-4 h-4" />
      </button>

      <ModalShell open={isOpen} onClose={() => setIsOpen(false)} title="Editar Valor Total">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-rojo/10 text-rojo text-sm rounded-md">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-tinta mb-1">Nuevo Valor Total</label>
            <input type="number" name="valor_nuevo" defaultValue={valorActual} required min="0" step="1" className="w-full rounded-2xl border border-linea bg-panel px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento" />
          </div>
          <div>
            <label className="block text-sm font-medium text-tinta mb-1">Motivo de la corrección</label>
            <textarea name="motivo" required rows={2} className="w-full rounded-2xl border border-linea bg-panel px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento" placeholder="Ej: Error de digitación al crear la cuenta"></textarea>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsOpen(false)} className="h-10 rounded-xl px-4 text-sm font-semibold text-tinta hover:bg-suave">Cancelar</button>
            <button type="submit" disabled={isPending} className="h-10 rounded-xl bg-acento px-4 text-sm font-semibold text-sobre-acento hover:bg-acento-fuerte disabled:opacity-50">Guardar Cambios</button>
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
      <button onClick={() => setIsOpen(true)} className="p-1.5 text-gris hover:text-info hover:bg-info/10 rounded-md transition-colors" title="Editar monto del abono">
        <Edit2 className="w-3.5 h-3.5" />
      </button>

      <ModalShell open={isOpen} onClose={() => setIsOpen(false)} title="Editar Monto de Abono">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-rojo/10 text-rojo text-sm rounded-md">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-tinta mb-1">Nuevo Monto</label>
            <input type="number" name="valor_nuevo" defaultValue={valorActual} required min="1" step="1" className="w-full rounded-2xl border border-linea bg-panel px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento" />
          </div>
          <div>
            <label className="block text-sm font-medium text-tinta mb-1">Motivo de la corrección</label>
            <textarea name="motivo" required rows={2} className="w-full rounded-2xl border border-linea bg-panel px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento" placeholder="Ej: Se registró un monto incorrecto"></textarea>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsOpen(false)} className="h-10 rounded-xl px-4 text-sm font-semibold text-tinta hover:bg-suave">Cancelar</button>
            <button type="submit" disabled={isPending} className="h-10 rounded-xl bg-acento px-4 text-sm font-semibold text-sobre-acento hover:bg-acento-fuerte disabled:opacity-50">Guardar Cambios</button>
          </div>
        </form>
      </ModalShell>
    </>
  )
}
