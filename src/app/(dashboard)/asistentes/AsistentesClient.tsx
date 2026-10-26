'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Edit2, UserX, UserCheck, Eye } from 'lucide-react'
import { toggleAsistenteEstado } from './actions'
import { DeleteButton } from './DeleteButton'
import { coincideBusqueda } from '@/lib/utils/busqueda'

type Asistente = {
  id: string
  nombre: string
  cedula: string | null
  correo: string | null
  telefono: string | null
  codigo: string | null
  activo: boolean
  activo_visible: boolean
  ultima_actividad: string | Date | null
}

const cardBase = 'rounded-2xl border border-linea bg-panel'

const fmtActividad = (valor: string | Date | null) =>
  valor ? new Date(valor).toLocaleDateString('es-CO', { timeZone: 'UTC' }) : 'Sin actividad'

function EstadoBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        activo ? 'bg-verde/12 text-verde' : 'bg-suave-2 text-gris'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${activo ? 'bg-verde' : 'bg-gris/60'}`} />
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  )
}

const iconBtn =
  'inline-grid h-9 w-9 place-items-center rounded-lg text-gris transition-colors hover:bg-suave hover:text-tinta'

function AccionesAsistente({ a }: { a: Asistente }) {
  return (
    <>
      <Link href={`/asistentes/${a.id}`} prefetch={false} className={iconBtn} title="Ver detalle">
        <Eye className="w-4 h-4" />
      </Link>
      <Link href={`/asistentes/${a.id}/editar`} prefetch={false} className={iconBtn} title="Editar asistente">
        <Edit2 className="w-4 h-4" />
      </Link>
      <form action={toggleAsistenteEstado.bind(null, a.id, !a.activo)} className="inline-block">
        <button
          type="submit"
          title={a.activo ? 'Desactivar asistente' : 'Activar asistente'}
          className={`inline-grid h-9 w-9 place-items-center rounded-lg transition-colors text-gris hover:bg-suave ${
            a.activo ? 'hover:text-ambar' : 'hover:text-acento'
          }`}
        >
          {a.activo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
        </button>
      </form>
      <DeleteButton id={a.id} nombre={a.nombre} />
    </>
  )
}

export function AsistentesClient({
  asistentes,
  initialQuery = '',
}: {
  asistentes: Asistente[]
  initialQuery?: string
}) {
  const [query, setQuery] = useState(initialQuery)

  const filtrados = useMemo(
    () => asistentes.filter((a) => coincideBusqueda([a.codigo, a.nombre, a.cedula], query)),
    [asistentes, query]
  )

  const vacioTexto =
    asistentes.length === 0
      ? 'No hay asistentes registrados.'
      : 'No hay asistentes que coincidan con la búsqueda.'

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gris" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por código, nombre o cédula..."
            aria-label="Buscar asistentes"
            className="h-10 w-full rounded-2xl border border-linea bg-panel pl-9 pr-4 text-sm text-tinta transition-colors placeholder:text-gris hover:border-linea-fuerte focus:border-acento"
          />
        </div>
        <p className="shrink-0 text-sm text-gris">{filtrados.length} asistente(s)</p>
      </div>

      {/* Tabla en escritorio */}
      <div className={`hidden md:block ${cardBase} overflow-hidden`}>
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto visible-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 z-10 border-b border-linea">
              <tr>
                <th className="px-5 py-3">Código</th>
                <th className="px-5 py-3">Nombre</th>
                <th className="px-5 py-3">Cédula</th>
                <th className="px-5 py-3">Contacto</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {filtrados.map((a) => (
                <tr key={a.id} className="hover:bg-suave transition-colors">
                  <td className="px-5 py-3 text-gris">{a.codigo || '-'}</td>
                  <td className="px-5 py-3 font-medium">
                    <Link href={`/asistentes/${a.id}`} prefetch={false} className="text-tinta underline-offset-4 hover:text-acento hover:underline">
                      {a.nombre}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gris">{a.cedula || '-'}</td>
                  <td className="px-5 py-3 text-gris">
                    <div>{a.correo || '-'}</div>
                    <div className="text-xs">{a.telefono || ''}</div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <EstadoBadge activo={a.activo_visible} />
                      <span className="whitespace-nowrap text-xs text-gris">
                        Última actividad: {fmtActividad(a.ultima_actividad)}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <AccionesAsistente a={a} />
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gris">
                    {vacioTexto}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tarjetas en móvil: cada asistente es un bloque separado */}
      <div className={`md:hidden ${cardBase} divide-y divide-linea overflow-hidden`}>
        {filtrados.length === 0 ? (
          <div className="p-8 text-center text-gris">{vacioTexto}</div>
        ) : (
          filtrados.map((a) => (
            <div key={a.id} className="fila-larga space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-sm text-gris">#{a.codigo || '-'}</span>
                    <Link href={`/asistentes/${a.id}`} prefetch={false} className="truncate font-medium text-tinta underline-offset-4 hover:text-acento hover:underline">
                      {a.nombre}
                    </Link>
                  </div>
                  {a.cedula && <p className="text-xs text-gris mt-0.5">C.C. {a.cedula}</p>}
                  {(a.correo || a.telefono) && (
                    <p className="text-xs text-gris mt-0.5 break-words">
                      {[a.correo, a.telefono].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <EstadoBadge activo={a.activo_visible} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gris">
                  Última actividad: {fmtActividad(a.ultima_actividad)}
                </span>
                <div className="flex items-center gap-0.5">
                  <AccionesAsistente a={a} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
