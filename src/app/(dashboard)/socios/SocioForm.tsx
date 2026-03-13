'use client'

import { useActionState } from 'react'
import { saveSocio } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'

export function SocioForm({ socio }: { socio?: any }) {
  const actionWithId = saveSocio.bind(null, socio?.id || null)
  const [state, formAction, isPending] = useActionState(actionWithId, null)

  return (
    <form action={formAction} className="space-y-6 max-w-2xl bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-600">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Nombre del Socio *</label>
          <Input name="nombre" defaultValue={socio?.nombre} required disabled={isPending} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Porcentaje de Participación (%) *</label>
          <Input 
            name="porcentaje_participacion" 
            type="number" 
            step="0.01" 
            min="0" 
            max="100" 
            defaultValue={socio?.porcentaje_participacion} 
            required 
            disabled={isPending} 
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pt-4 border-t border-zinc-100">
        <Link href="/socios" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando...' : 'Guardar Socio'}
        </Button>
      </div>
    </form>
  )
}
