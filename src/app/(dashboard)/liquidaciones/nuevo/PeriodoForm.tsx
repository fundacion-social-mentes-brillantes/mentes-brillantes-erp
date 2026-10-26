'use client'

import { useActionState } from 'react'
import { savePeriodo } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'

export function PeriodoForm() {
  const [state, formAction, isPending] = useActionState(savePeriodo, null)
  const recordarFormulario = useConservarSiFalla(state)

  return (
    <form onSubmitCapture={recordarFormulario} action={formAction} className="space-y-6 max-w-2xl rounded-2xl border border-linea bg-panel p-5 md:p-6">
      {state?.error && (
        <div className="p-3 bg-rojo/10 border border-rojo/30 rounded-lg flex items-start gap-3 text-rojo">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-tinta">Nombre del Período *</label>
          <Input name="nombre" placeholder="Ej: Febrero 2026" required disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Fecha de Inicio *</label>
          <Input name="fecha_inicio" type="date" required disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Fecha de Fin *</label>
          <Input name="fecha_fin" type="date" required disabled={isPending} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pt-4 border-t border-linea">
        <Link href="/liquidaciones" className="text-sm font-medium text-gris hover:text-tinta">
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando...' : 'Abrir Período'}
        </Button>
      </div>
    </form>
  )
}
