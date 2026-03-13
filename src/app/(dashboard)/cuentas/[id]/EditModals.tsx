'use client'

import { useState, useTransition } from 'react'
import { Edit2, X } from 'lucide-react'
import { editValorCuenta, editMontoAbono } from '../actions'

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
      
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-zinc-100">
              <h3 className="font-medium text-zinc-900">Editar Valor Total</h3>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-zinc-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Nuevo Valor Total</label>
                <input type="number" name="valor_nuevo" defaultValue={valorActual} required min="1" step="1" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Motivo de la corrección</label>
                <textarea name="motivo" required rows={2} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900" placeholder="Ej: Error de digitación al crear la cuenta"></textarea>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-md">Cancelar</button>
                <button type="submit" disabled={isPending} className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-md disabled:opacity-50">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
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
      
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 text-left">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-zinc-100">
              <h3 className="font-medium text-zinc-900">Editar Monto de Abono</h3>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-zinc-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Nuevo Monto</label>
                <input type="number" name="valor_nuevo" defaultValue={valorActual} required min="1" step="1" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Motivo de la corrección</label>
                <textarea name="motivo" required rows={2} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900" placeholder="Ej: Se registró un monto incorrecto"></textarea>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-md">Cancelar</button>
                <button type="submit" disabled={isPending} className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-md disabled:opacity-50">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
