'use client'

import { useActionState } from 'react'
import { registroAction } from './actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export function RegistroForm() {
  const [state, formAction, isPending] = useActionState(registroAction, null)

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900" htmlFor="email">
          Correo electr\u00f3nico
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="consultante@correo.com"
          defaultValue={state?.email || ''}
          required
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900" htmlFor="password">
          Contrase\u00f1a
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900" htmlFor="confirm">
          Confirmar contrase\u00f1a
        </label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          minLength={8}
          required
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900" htmlFor="codigo">
          C\u00f3digo del asistente
        </label>
        <Input
          id="codigo"
          name="codigo"
          type="text"
          placeholder="Ej: A-102"
          defaultValue={state?.codigo || ''}
          required
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900" htmlFor="cedula">
          N\u00famero de c\u00e9dula
        </label>
        <Input
          id="cedula"
          name="cedula"
          type="text"
          placeholder="Sin puntos ni espacios"
          defaultValue={state?.cedula || ''}
          required
          disabled={isPending}
        />
      </div>

      <Button type="submit" className="w-full mt-6" disabled={isPending}>
        {isPending ? 'Creando cuenta...' : 'Registrarse'}
      </Button>

      {state?.error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-600">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}
    </form>
  )
}
