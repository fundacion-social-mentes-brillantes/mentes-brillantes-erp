'use client'

import { FormEvent, useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AlertCircle, CalendarDays, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updatePeriodoFechaFin } from './actions'

type AjustarFechaPeriodoModalProps = {
  periodoId: string
  fechaInicio: string
  fechaFin: string
}

export function AjustarFechaPeriodoModal({ periodoId, fechaInicio, fechaFin }: AjustarFechaPeriodoModalProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen])

  const openModal = () => {
    setError('')
    setSuccess(false)
    setIsOpen(true)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess(false)

    const formData = new FormData(event.currentTarget)
    const nuevaFechaFin = String(formData.get('fecha_fin') || '')

    startTransition(async () => {
      const result = await updatePeriodoFechaFin(periodoId, nuevaFechaFin)
      if (result?.error) {
        setError(result.error)
        return
      }

      setSuccess(true)
      router.refresh()
      window.setTimeout(() => setIsOpen(false), 600)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
      >
        <CalendarDays className="w-3.5 h-3.5" />
        Ajustar fecha
      </button>

      {mounted && isOpen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="absolute inset-0" onClick={() => setIsOpen(false)} aria-label="Cerrar modal" />
              <div className="relative w-full max-w-md rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[rgb(var(--border))] p-4">
                  <h3 className="font-semibold text-[rgb(var(--text-primary))]">Ajustar fecha final</h3>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="text-[rgb(var(--text-muted))] transition-colors hover:text-[rgb(var(--text-primary))]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 p-5">
                  {error && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-600">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                      <p className="text-sm font-medium">{error}</p>
                    </div>
                  )}

                  {success && (
                    <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                      <p className="text-sm font-medium">Fecha final actualizada.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Fecha final</label>
                    <Input
                      name="fecha_fin"
                      type="date"
                      defaultValue={fechaFin}
                      min={fechaInicio}
                      required
                      disabled={isPending || success}
                      className="dark:[color-scheme:dark]"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} disabled={isPending}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isPending || success}>
                      {isPending ? 'Guardando...' : 'Guardar'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
