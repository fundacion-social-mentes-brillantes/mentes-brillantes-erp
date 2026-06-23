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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Liquidaciones</h1>
          <p className="text-zinc-500 text-sm">Gestiona los períodos contables y la distribución a socios.</p>
        </div>
        <Link 
          href="/liquidaciones/nuevo" 
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Nuevo Período
        </Link>
      </div>

      <div className="hidden md:block rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
              <tr>
                <th className="px-6 py-4">Nombre del Período</th>
                <th className="px-6 py-4">Desde</th>
                <th className="px-6 py-4">Hasta</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {periodos?.map((periodo) => (
                <tr key={periodo.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-zinc-900">{periodo.nombre}</td>
                  <td className="px-6 py-4 text-zinc-500">{new Date(periodo.fecha_inicio).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-zinc-500">{new Date(periodo.fecha_fin).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium 
                      ${periodo.estado === 'abierto' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'}`}>
                      {periodo.estado === 'cerrado' && <Lock className="w-3 h-3" />}
                      {periodo.estado.charAt(0).toUpperCase() + periodo.estado.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      {periodo.estado === 'abierto' && (
                        <AjustarFechaPeriodoModal
                          periodoId={periodo.id}
                          fechaInicio={periodo.fecha_inicio}
                          fechaFin={periodo.fecha_fin}
                        />
                      )}
                      <Link href={`/liquidaciones/${periodo.id}`} className="inline-flex p-2 text-zinc-400 hover:text-blue-600 transition-colors rounded-md hover:bg-blue-50">
                      <Eye className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {!periodos?.length && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
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
          <div className="bg-white p-6 rounded-xl border border-zinc-200 text-center text-zinc-500">
            No hay períodos registrados.
          </div>
        ) : (
          periodos.map((periodo) => (
            <div key={periodo.id} className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-zinc-900 leading-snug">{periodo.nombre}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(periodo.fecha_inicio).toLocaleDateString()} — {new Date(periodo.fecha_fin).toLocaleDateString()}
                  </p>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${periodo.estado === 'abierto' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'}`}>
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
                  href={`/liquidaciones/${periodo.id}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
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
