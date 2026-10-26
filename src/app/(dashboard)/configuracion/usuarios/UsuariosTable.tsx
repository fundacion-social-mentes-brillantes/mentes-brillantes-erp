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
      className="hidden md:grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm"
    >
      <input type="hidden" name="id" value={perfil.id} />
      <span className="col-span-4 text-tinta font-medium">{perfil.nombre}</span>

      <select
        name="rol"
        defaultValue={perfil.rol}
        className="col-span-3 h-9 rounded-md border border-linea bg-suave px-2 text-tinta"
      >
        <option value="admin">admin</option>
        <option value="caja">caja</option>
        <option value="consulta">consulta</option>
      </select>

      <select
        name="asistente_id"
        defaultValue={perfil.asistente_id || ''}
        className="col-span-4 h-9 rounded-md border border-linea bg-suave px-2 text-tinta"
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
          className="inline-flex items-center justify-center rounded-md border border-linea bg-suave px-3 py-1 text-xs font-medium text-tinta hover:bg-suave-2"
        >
          Guardar
        </button>
      </div>

      {state?.error && (
        <div className="col-span-12 text-xs text-rojo mt-1">{state.error}</div>
      )}
      {state?.success && (
        <div className="col-span-12 text-xs text-acento-fuerte mt-1">Actualizado</div>
      )}
    </form>
  )
}

export default function UsuariosTable({ perfiles, asistentes }: Props) {
  const MobileUsuarioRow = ({ perfil }: { perfil: Perfil }) => {
    const [state, formAction, pending] = useActionState(actualizarUsuario, null)
    return (
      <form
        key={perfil.id}
        action={formAction}
        className="rounded-lg border border-linea bg-panel p-4 shadow-soft space-y-3 text-sm"
      >
        <input type="hidden" name="id" value={perfil.id} />
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-tinta font-semibold leading-snug">{perfil.nombre}</p>
            <p className="text-xs text-gris">Edición rápida</p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gris">Rol</label>
          <select
            name="rol"
            defaultValue={perfil.rol}
            disabled={pending}
            className="w-full h-9 rounded-md border border-linea bg-suave px-2 text-tinta"
          >
            <option value="admin">admin</option>
            <option value="caja">caja</option>
            <option value="consulta">consulta</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gris">Asistente vinculado (solo consulta)</label>
          <select
            name="asistente_id"
            defaultValue={perfil.asistente_id || ''}
            disabled={pending}
            className="w-full h-9 rounded-md border border-linea bg-suave px-2 text-tinta"
          >
            <option value="">-- Sin asignar --</option>
            {asistentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={pending}
            className="w-full inline-flex items-center justify-center rounded-md border border-linea bg-suave px-3 py-2 text-sm font-semibold text-tinta hover:bg-suave-2 transition-colors"
          >
            {pending ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {state?.error && <span className="text-xs text-rojo">{state.error}</span>}
          {state?.success && <span className="text-xs text-acento-fuerte">Actualizado</span>}
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-4">
      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border border-linea bg-panel shadow-soft overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-3 text-sm font-medium text-gris border-b border-linea">
          <span className="col-span-4">Nombre</span>
          <span className="col-span-3">Rol</span>
          <span className="col-span-4">Asistente vinculado (solo consulta)</span>
          <span className="col-span-1 text-right">Guardar</span>
        </div>
        <div className="divide-y divide-linea">
          {perfiles.map((perfil) => (
            <UsuarioRow key={perfil.id} perfil={perfil} asistentes={asistentes} />
          ))}
        </div>
      </div>

      {/* Mobile list */}
      <div className="md:hidden space-y-3">
        {perfiles.map((perfil) => (
          <MobileUsuarioRow key={perfil.id} perfil={perfil} />
        ))}
      </div>
    </div>
  )
}
