'use client'

import { useActionState } from 'react'
import { loginAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, null)

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-[rgb(var(--text-primary))]" htmlFor="email">
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
          <label className="text-sm font-semibold text-[rgb(var(--text-primary))]" htmlFor="password">
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
        <div className="mt-4 p-3 bg-[rgba(var(--danger),0.1)] border border-[rgba(var(--danger),0.28)] rounded-xl flex items-start gap-3 text-[rgb(var(--danger-strong))]">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}
    </form>
  )
}
