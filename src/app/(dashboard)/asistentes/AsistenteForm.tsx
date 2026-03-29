'use client'

import { useActionState, useState } from 'react'
import { saveAsistente } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'

export function AsistenteForm({ asistente, codigoSugerido, readOnlyDates = false }: { asistente?: any; codigoSugerido?: number; readOnlyDates?: boolean }) {
  const actionWithId = saveAsistente.bind(null, asistente?.id || null)
  const [state, formAction, isPending] = useActionState(actionWithId, null)

  const [codigoInterno, setCodigoInterno] = useState<string>(
    asistente?.codigo != null
      ? String(asistente.codigo)
      : codigoSugerido != null
        ? String(codigoSugerido)
        : ''
  )

  return (
    <form action={formAction} className="space-y-6 w-full max-w-2xl bg-white p-4 md:p-6 rounded-xl border border-zinc-200 shadow-sm">
      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-600">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Nombre Completo *</label>
          <Input name="nombre" defaultValue={asistente?.nombre} required disabled={isPending} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Cédula</label>
          <Input name="cedula" defaultValue={asistente?.cedula} disabled={isPending} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Correo Electrónico</label>
          <Input name="correo" type="email" defaultValue={asistente?.correo} disabled={isPending} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Teléfono</label>
          <Input name="telefono" defaultValue={asistente?.telefono} disabled={isPending} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Código Interno</label>
          <Input
            name="codigo"
            value={codigoInterno}
            onChange={(e) => setCodigoInterno(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Fecha de registro</label>
          <Input
            name="fecha_registro"
            type="date"
            defaultValue={asistente?.fecha_registro || ''}
            disabled={isPending || readOnlyDates}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Fecha de inicio de proceso</label>
          <Input
            name="fecha_inicio_proceso"
            type="date"
            defaultValue={asistente?.fecha_inicio_proceso || ''}
            disabled={isPending || readOnlyDates}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 pt-4 border-t border-zinc-100">
        <Link href="/asistentes" className="text-sm font-medium text-center text-zinc-500 hover:text-zinc-900">
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto justify-center">
          {isPending ? 'Guardando...' : 'Guardar Asistente'}
        </Button>
      </div>
    </form>
  )
}
