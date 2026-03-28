'use client'

import { useActionState, useState } from 'react'
import { crearUsuario, UsuarioState } from './actions'

type Asistente = { id: string; nombre: string }

export function NewUsuarioForm({ asistentes }: { asistentes: Asistente[] }) {
  const [rol, setRol] = useState<'admin' | 'caja' | 'consulta'>('caja')
  const [state, formAction, pending] = useActionState<UsuarioState, FormData>(crearUsuario, null)

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-[rgb(var(--text-primary))]">Nuevo usuario interno</h3>
          <p className="text-xs text-[rgb(var(--text-muted))]">Crea usuarios de admin o caja en un solo paso.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-[rgb(var(--text-muted))]" htmlFor="nombre">
            Nombre
          </label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            required
            disabled={pending}
            className="w-full h-10 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 text-[rgb(var(--text-primary))]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[rgb(var(--text-muted))]" htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            disabled={pending}
            className="w-full h-10 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 text-[rgb(var(--text-primary))]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[rgb(var(--text-muted))]" htmlFor="password">
            Contraseña temporal
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            disabled={pending}
            className="w-full h-10 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 text-[rgb(var(--text-primary))]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[rgb(var(--text-muted))]" htmlFor="rol">
            Rol
          </label>
          <select
            id="rol"
            name="rol"
            value={rol}
            onChange={(e) => setRol(e.target.value as 'admin' | 'caja' | 'consulta')}
            disabled={pending}
            className="w-full h-10 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 text-[rgb(var(--text-primary))]"
          >
            <option value="admin">admin</option>
            <option value="caja">caja</option>
            <option value="consulta">consulta</option>
          </select>
        </div>
        {rol === 'consulta' && (
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-[rgb(var(--text-muted))]" htmlFor="asistente_id">
              Asistente vinculado (obligatorio para consulta)
            </label>
            <select
              id="asistente_id"
              name="asistente_id"
              required
              disabled={pending}
              className="w-full h-10 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 text-[rgb(var(--text-primary))]"
            >
              <option value="">-- Selecciona asistente --</option>
              {asistentes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2 text-sm font-semibold text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--surface-3))] transition-colors"
        >
          {pending ? 'Creando...' : 'Crear usuario'}
        </button>
        {state?.error && <span className="text-xs text-[rgb(var(--danger))]">{state.error}</span>}
        {state?.success && <span className="text-xs text-[rgb(var(--accent-strong))]">Usuario creado</span>}
      </div>
    </form>
  )
}
