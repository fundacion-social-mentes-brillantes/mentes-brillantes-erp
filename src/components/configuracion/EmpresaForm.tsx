'use client'

import { useState } from 'react'
import { Save, Lock } from 'lucide-react'
import { actualizarConfiguracionEmpresa } from '@/app/(dashboard)/configuracion/actions'

type EmpresaData = {
  nombre: string
  nit: string
  correo: string | null
  telefono: string | null
  ciudad: string | null
}

export function EmpresaForm({ initialData, isAdmin }: { initialData: EmpresaData, isAdmin: boolean }) {
  const [isPending, setIsPending] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!isAdmin) return

    setIsPending(true)
    setMessage(null)

    const formData = new FormData(e.currentTarget)
    try {
      await actualizarConfiguracionEmpresa(formData)
      setMessage({ type: 'success', text: 'Configuración guardada correctamente.' })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Error al guardar la configuración.' })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isAdmin && (
        <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-sm flex items-center gap-2 mb-4 border border-amber-200">
          <Lock className="w-4 h-4" />
          Solo los administradores pueden editar esta información.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="nombre" className="text-sm font-medium text-zinc-700">Nombre de la Fundación *</label>
          <input
            type="text"
            id="nombre"
            name="nombre"
            defaultValue={initialData.nombre}
            required
            disabled={!isAdmin || isPending}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="nit" className="text-sm font-medium text-zinc-700">NIT *</label>
          <input
            type="text"
            id="nit"
            name="nit"
            defaultValue={initialData.nit}
            required
            disabled={!isAdmin || isPending}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="correo" className="text-sm font-medium text-zinc-700">Correo Electrónico</label>
          <input
            type="email"
            id="correo"
            name="correo"
            defaultValue={initialData.correo || ''}
            disabled={!isAdmin || isPending}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="telefono" className="text-sm font-medium text-zinc-700">Teléfono</label>
          <input
            type="text"
            id="telefono"
            name="telefono"
            defaultValue={initialData.telefono || ''}
            disabled={!isAdmin || isPending}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="ciudad" className="text-sm font-medium text-zinc-700">Ciudad</label>
          <input
            type="text"
            id="ciudad"
            name="ciudad"
            defaultValue={initialData.ciudad || ''}
            disabled={!isAdmin || isPending}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
          />
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isPending ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      )}
    </form>
  )
}
