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

const cardBase = 'rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] shadow-sm'

const fmtActividad = (valor: string | Date | null) =>
  valor ? new Date(valor).toLocaleDateString('es-CO', { timeZone: 'UTC' }) : 'Sin actividad'

function EstadoBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
        activo
          ? 'bg-[rgba(var(--accent),0.14)] text-[rgb(var(--accent))] border-[rgba(var(--accent),0.35)]'
          : 'bg-[rgba(var(--danger),0.14)] text-[rgb(var(--danger))] border-[rgba(var(--danger),0.35)]'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${activo ? 'bg-[rgb(var(--accent))]' : 'bg-[rgb(var(--danger))]'}`} />
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  )
}

const iconBtn =
  'inline-flex p-2 rounded-md text-[rgb(var(--text-muted))] hover:text-[rgb(var(--accent))] hover:bg-[rgb(var(--surface-2))] transition-colors'

function AccionesAsistente({ a }: { a: Asistente }) {
  return (
    <>
      <Link href={`/asistentes/${a.id}`} className={iconBtn} title="Ver detalle">
        <Eye className="w-4 h-4" />
      </Link>
      <Link href={`/asistentes/${a.id}/editar`} className={iconBtn} title="Editar asistente">
        <Edit2 className="w-4 h-4" />
      </Link>
      <form action={toggleAsistenteEstado.bind(null, a.id, !a.activo)} className="inline-block">
        <button
          type="submit"
          title={a.activo ? 'Desactivar asistente' : 'Activar asistente'}
          className={`inline-flex p-2 rounded-md transition-colors text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-2))] ${
            a.activo ? 'hover:text-[rgb(var(--warning))]' : 'hover:text-[rgb(var(--accent))]'
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
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-[rgb(var(--text-muted))]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por código, nombre o cédula..."
            aria-label="Buscar asistentes"
            className="h-10 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] pl-9 pr-4 text-sm text-[rgb(var(--text-primary))] outline-none focus:border-[rgb(var(--accent))]"
          />
        </div>
        <p className="text-xs text-[rgb(var(--text-muted))] shrink-0">{filtrados.length} asistente(s)</p>
      </div>

      {/* Tabla en escritorio */}
      <div className={`hidden md:block ${cardBase} overflow-hidden`}>
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto visible-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="bg-[rgb(var(--surface-2))] border-b border-[rgb(var(--border))] text-[rgb(var(--text-muted))] font-medium sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4">Código</th>
                <th className="px-6 py-4">Nombre</th>
                <th className="px-6 py-4">Cédula</th>
                <th className="px-6 py-4">Contacto</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {filtrados.map((a) => (
                <tr key={a.id} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                  <td className="px-6 py-4 font-medium text-[rgb(var(--text-primary))]">{a.codigo || '-'}</td>
                  <td className="px-6 py-4 font-medium">
                    <Link href={`/asistentes/${a.id}`} className="text-[rgb(var(--accent))] hover:underline">
                      {a.nombre}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-[rgb(var(--text-muted))]">{a.cedula || '-'}</td>
                  <td className="px-6 py-4 text-[rgb(var(--text-muted))]">
                    <div>{a.correo || '-'}</div>
                    <div className="text-xs">{a.telefono || ''}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <EstadoBadge activo={a.activo_visible} />
                      <span className="text-[11px] text-[rgb(var(--text-muted))]">
                        Última actividad: {fmtActividad(a.ultima_actividad)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap space-x-1">
                    <AccionesAsistente a={a} />
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[rgb(var(--text-muted))]">
                    {vacioTexto}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tarjetas en móvil: cada asistente es un bloque separado */}
      <div className="md:hidden space-y-3">
        {filtrados.length === 0 ? (
          <div className={`${cardBase} p-8 text-center text-[rgb(var(--text-muted))]`}>{vacioTexto}</div>
        ) : (
          filtrados.map((a) => (
            <div key={a.id} className={`${cardBase} p-4 space-y-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-[rgb(var(--text-muted))] shrink-0">#{a.codigo || '-'}</span>
                    <Link href={`/asistentes/${a.id}`} className="font-medium text-[rgb(var(--accent))] hover:underline truncate">
                      {a.nombre}
                    </Link>
                  </div>
                  {a.cedula && <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5">C.C. {a.cedula}</p>}
                  {(a.correo || a.telefono) && (
                    <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5 break-words">
                      {[a.correo, a.telefono].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <EstadoBadge activo={a.activo_visible} />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[rgb(var(--border))]">
                <span className="text-[11px] text-[rgb(var(--text-muted))]">
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
