'use client'

import { mensajeDeError } from '@/lib/utils/errores'
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
    } catch (error) {
      setMessage({ type: 'error', text: mensajeDeError(error, 'Error al guardar la configuración.') })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isAdmin && (
        <div className="bg-ambar/10 text-ambar p-3 rounded-lg text-sm flex items-center gap-2 mb-4 border border-ambar/30">
          <Lock className="w-4 h-4" />
          Solo los administradores pueden editar esta información.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="nombre" className="text-sm font-medium text-tinta">Nombre de la Fundación *</label>
          <input
            type="text"
            id="nombre"
            name="nombre"
            defaultValue={initialData.nombre}
            required
            disabled={!isAdmin || isPending}
            className="w-full px-3 py-2 border border-linea-fuerte rounded-lg focus:outline-none focus:ring-2 focus:ring-acento disabled:bg-suave-2 disabled:text-gris"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="nit" className="text-sm font-medium text-tinta">NIT *</label>
          <input
            type="text"
            id="nit"
            name="nit"
            defaultValue={initialData.nit}
            required
            disabled={!isAdmin || isPending}
            className="w-full px-3 py-2 border border-linea-fuerte rounded-lg focus:outline-none focus:ring-2 focus:ring-acento disabled:bg-suave-2 disabled:text-gris"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="correo" className="text-sm font-medium text-tinta">Correo Electrónico</label>
          <input
            type="email"
            id="correo"
            name="correo"
            defaultValue={initialData.correo || ''}
            disabled={!isAdmin || isPending}
            className="w-full px-3 py-2 border border-linea-fuerte rounded-lg focus:outline-none focus:ring-2 focus:ring-acento disabled:bg-suave-2 disabled:text-gris"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="telefono" className="text-sm font-medium text-tinta">Teléfono</label>
          <input
            type="text"
            id="telefono"
            name="telefono"
            defaultValue={initialData.telefono || ''}
            disabled={!isAdmin || isPending}
            className="w-full px-3 py-2 border border-linea-fuerte rounded-lg focus:outline-none focus:ring-2 focus:ring-acento disabled:bg-suave-2 disabled:text-gris"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="ciudad" className="text-sm font-medium text-tinta">Ciudad</label>
          <input
            type="text"
            id="ciudad"
            name="ciudad"
            defaultValue={initialData.ciudad || ''}
            disabled={!isAdmin || isPending}
            className="w-full px-3 py-2 border border-linea-fuerte rounded-lg focus:outline-none focus:ring-2 focus:ring-acento disabled:bg-suave-2 disabled:text-gris"
          />
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-verde/10 text-verde border border-verde/30' : 'bg-rojo/10 text-rojo border border-rojo/30'}`}>
          {message.text}
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 bg-acento text-sobre-acento px-4 py-2 rounded-lg hover:bg-acento-fuerte transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isPending ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      )}
    </form>
  )
}
