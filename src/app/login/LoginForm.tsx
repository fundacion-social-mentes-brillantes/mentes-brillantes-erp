'use client'

import { useActionState } from 'react'
import { loginAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, null)
  const recordarFormulario = useConservarSiFalla(state)

  return (
    <form onSubmitCapture={recordarFormulario} action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-tinta" htmlFor="email">
          Correo electrónico
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="admin@fundacion.com"
          defaultValue={state?.email || ''}
          required
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-tinta" htmlFor="password">
            Contraseña
          </label>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          defaultValue=""
          required
          disabled={isPending}
        />
      </div>

      <Button type="submit" className="w-full mt-6" disabled={isPending}>
        {isPending ? 'Ingresando...' : 'Ingresar al sistema'}
      </Button>

      {state?.error && (
        <div className="mt-4 p-3 bg-rojo/10 border border-rojo/28 rounded-xl flex items-start gap-3 text-rojo-fuerte">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}
    </form>
  )
}
