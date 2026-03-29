import Link from 'next/link'
import { Plus, Edit2 } from 'lucide-react'
import { DeleteEgresoButton } from './DeleteEgresoButton'
import { requireRoles } from '@/lib/utils/authz'

export default async function EgresosPage() {
  const { supabase } = await requireRoles(['admin', 'caja'])
  const { data: egresos } = await supabase?.from('egresos').select('*').order('fecha', { ascending: false }) || { data: [] }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Egresos</h1>
          <p className="text-zinc-500 text-sm">Registro de gastos operativos y administrativos.</p>
        </div>
        <Link 
          href="/egresos/nuevo" 
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Nuevo Egreso
        </Link>
      </div>

      <div className="hidden md:block rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Concepto</th>
                <th className="px-6 py-4">Categoría</th>
                <th className="px-6 py-4">Método</th>
                <th className="px-6 py-4 text-right">Monto</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {egresos?.map((egreso) => (
                <tr key={egreso.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4 text-zinc-500">{new Date(egreso.fecha).toLocaleDateString()}</td>
                  <td className="px-6 py-4 font-medium text-zinc-900">{egreso.concepto}</td>
                  <td className="px-6 py-4 text-zinc-500">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700">
                      {egreso.categoria}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500 capitalize">{egreso.metodo_pago}</td>
                  <td className="px-6 py-4 text-right font-medium text-red-600">
                    ${Number(egreso.monto).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Link href={`/egresos/${egreso.id}/editar`} className="inline-flex p-2 text-zinc-400 hover:text-blue-600 transition-colors rounded-md hover:bg-blue-50">
                      <Edit2 className="w-4 h-4" />
                    </Link>
                    <DeleteEgresoButton id={egreso.id} />
                  </td>
                </tr>
              ))}
              {!egresos?.length && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                    No hay egresos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {!egresos?.length ? (
          <div className="bg-white p-6 rounded-xl border border-zinc-200 text-center text-zinc-500">
            No hay egresos registrados.
          </div>
        ) : (
          egresos.map((egreso) => (
            <div key={egreso.id} className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm space-y-3">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <p className="text-sm text-zinc-500">{new Date(egreso.fecha).toLocaleDateString()}</p>
                  <p className="font-semibold text-zinc-900 leading-snug">{egreso.concepto}</p>
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium bg-zinc-100 text-zinc-700">
                    {egreso.categoria}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500 capitalize">{egreso.metodo_pago}</p>
                  <p className="font-bold text-red-600 text-lg">${Number(egreso.monto).toLocaleString()}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Link
                  href={`/egresos/${egreso.id}/editar`}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Editar
                </Link>
                <DeleteEgresoButton id={egreso.id} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
