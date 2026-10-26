import { formatearFechaIso } from '@/lib/utils/fechas'
import Link from 'next/link'
import { Plus, Eye, Lock } from 'lucide-react'
import { requireRoles } from '@/lib/utils/authz'
import { AjustarFechaPeriodoModal } from './AjustarFechaPeriodoModal'

export default async function LiquidacionesPage() {
  const { supabase } = await requireRoles(['admin'])
  const { data: periodos } = await supabase?.from('periodos').select('*').order('fecha_inicio', { ascending: false }) || { data: [] }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Liquidaciones</h1>
          <p className="text-gris text-sm">Gestiona los períodos contables y la distribución a socios.</p>
        </div>
        <Link 
          href="/liquidaciones/nuevo" 
          className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-acento px-4 text-sm font-semibold text-sobre-acento transition-colors hover:bg-acento-fuerte sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Nuevo Período
        </Link>
      </div>

      <div className="hidden md:block rounded-2xl border border-linea bg-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="border-b border-linea">
              <tr>
                <th className="px-5 py-3">Nombre del Período</th>
                <th className="px-5 py-3">Desde</th>
                <th className="px-5 py-3">Hasta</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {periodos?.map((periodo) => (
                <tr key={periodo.id} className="hover:bg-suave/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-tinta">{periodo.nombre}</td>
                  <td className="px-5 py-3 text-gris">{formatearFechaIso(periodo.fecha_inicio)}</td>
                  <td className="px-5 py-3 text-gris">{formatearFechaIso(periodo.fecha_fin)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium 
                      ${periodo.estado === 'abierto' ? 'bg-verde/15 text-verde' : 'bg-suave-2 text-tinta'}`}>
                      {periodo.estado === 'cerrado' && <Lock className="w-3 h-3" />}
                      {periodo.estado.charAt(0).toUpperCase() + periodo.estado.slice(1)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      {periodo.estado === 'abierto' && (
                        <AjustarFechaPeriodoModal
                          periodoId={periodo.id}
                          fechaInicio={periodo.fecha_inicio}
                          fechaFin={periodo.fecha_fin}
                        />
                      )}
                      <Link href={`/liquidaciones/${periodo.id}`} prefetch={false} className="inline-flex p-2 text-gris hover:text-info transition-colors rounded-md hover:bg-info/10">
                      <Eye className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {!periodos?.length && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gris">
                    No hay períodos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tarjetas móvil */}
      <div className="md:hidden space-y-3">
        {!periodos?.length ? (
          <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6 text-center text-gris">
            No hay períodos registrados.
          </div>
        ) : (
          periodos.map((periodo) => (
            <div key={periodo.id} className="bg-panel p-4 rounded-xl border border-linea space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-tinta leading-snug">{periodo.nombre}</p>
                  <p className="text-xs text-gris">
                    {formatearFechaIso(periodo.fecha_inicio)} — {formatearFechaIso(periodo.fecha_fin)}
                  </p>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${periodo.estado === 'abierto' ? 'bg-verde/15 text-verde' : 'bg-suave-2 text-tinta'}`}>
                  {periodo.estado === 'cerrado' && <Lock className="w-3 h-3" />}
                  {periodo.estado.charAt(0).toUpperCase() + periodo.estado.slice(1)}
                </span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {periodo.estado === 'abierto' && (
                  <AjustarFechaPeriodoModal
                    periodoId={periodo.id}
                    fechaInicio={periodo.fecha_inicio}
                    fechaFin={periodo.fecha_fin}
                  />
                )}
                <Link
                  href={`/liquidaciones/${periodo.id}`} prefetch={false}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-linea px-3 py-2 text-sm font-medium text-tinta hover:bg-suave transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Ver detalle
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
