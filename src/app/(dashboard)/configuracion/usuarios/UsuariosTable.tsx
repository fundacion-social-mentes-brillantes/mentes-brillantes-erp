'use client'

import { useActionState } from 'react'
import { actualizarUsuario } from './actions'

type Perfil = {
  id: string
  nombre: string
  rol: 'admin' | 'caja' | 'consulta'
  asistente_id: string | null
  asistentes?: { nombre?: string | null } | { nombre?: string | null }[] | null
}

type Asistente = { id: string; nombre: string }

type Props = {
  perfiles: Perfil[]
  asistentes: Asistente[]
}

function UsuarioRow({ perfil, asistentes }: { perfil: Perfil; asistentes: Asistente[] }) {
  const [state, formAction] = useActionState(actualizarUsuario, null)

  return (
    <form
      action={formAction}
      className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm"
    >
      <input type="hidden" name="id" value={perfil.id} />
      <span className="col-span-4 text-[rgb(var(--text-primary))] font-medium">{perfil.nombre}</span>

      <select
        name="rol"
        defaultValue={perfil.rol}
        className="col-span-3 h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2 text-[rgb(var(--text-primary))]"
      >
        <option value="admin">admin</option>
        <option value="caja">caja</option>
        <option value="consulta">consulta</option>
      </select>

      <select
        name="asistente_id"
        defaultValue={perfil.asistente_id || ''}
        className="col-span-4 h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2 text-[rgb(var(--text-primary))]"
      >
        <option value="">-- Sin asignar --</option>
        {asistentes.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nombre}
          </option>
        ))}
      </select>

      <div className="col-span-1 text-right">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1 text-xs font-medium text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--surface-3))]"
        >
          Guardar
        </button>
      </div>

      {state?.error && (
        <div className="col-span-12 text-xs text-[rgb(var(--danger))] mt-1">{state.error}</div>
      )}
      {state?.success && (
        <div className="col-span-12 text-xs text-[rgb(var(--accent-strong))] mt-1">Actualizado</div>
      )}
    </form>
  )
}

export default function UsuariosTable({ perfiles, asistentes }: Props) {
  return (
    <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] shadow-soft overflow-hidden">
      <div className="grid grid-cols-12 px-4 py-3 text-sm font-medium text-[rgb(var(--text-muted))] border-b border-[rgb(var(--border))]">
        <span className="col-span-4">Nombre</span>
        <span className="col-span-3">Rol</span>
        <span className="col-span-4">Asistente vinculado (solo consulta)</span>
        <span className="col-span-1 text-right">Guardar</span>
      </div>
      <div className="divide-y divide-[rgb(var(--border))]">
        {perfiles.map((perfil) => (
          <UsuarioRow key={perfil.id} perfil={perfil} asistentes={asistentes} />
        ))}
      </div>
    </div>
  )
}
