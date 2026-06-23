import Link from 'next/link'
import { Edit2, Plus } from 'lucide-react'
import { requireRoles } from '@/lib/utils/authz'
import { VentaExternaActions } from './VentaExternaActions'

export default async function VentasExternasPage() {
  const { supabase, perfil } = await requireRoles(['admin', 'caja'])
  const isAdmin = perfil.rol === 'admin'
  const { data: ventas } =
    (await supabase?.from('ventas_externas').select('*').order('fecha', { ascending: false })) || { data: [] }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Ventas Externas</h1>
          <p className="text-zinc-500 text-sm">Ingresos por productos o servicios sin cuenta por cobrar asociada.</p>
        </div>
        <Link
          href="/ventas-externas/nueva"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva venta externa
        </Link>
      </div>

      <div className="hidden md:block rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Concepto</th>
                <th className="px-6 py-4">Comprador</th>
                <th className="px-6 py-4">Método</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Monto</th>
                {isAdmin && <th className="px-6 py-4 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {ventas?.map((venta) => (
                <tr key={venta.id} className={venta.estado === 'anulado' ? 'opacity-60' : 'hover:bg-zinc-50/50'}>
                  <td className="px-6 py-4 text-zinc-500">{new Date(venta.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC' })}</td>
                  <td className="px-6 py-4 font-medium text-zinc-900">{venta.concepto}</td>
                  <td className="px-6 py-4 text-zinc-500">{venta.comprador_nombre || 'Sin comprador'}</td>
                  <td className="px-6 py-4 text-zinc-500 capitalize">{venta.metodo_pago}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700">
                      {venta.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-emerald-600">
                    ${Number(venta.monto).toLocaleString()}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right space-x-2">
                      <Link href={`/ventas-externas/${venta.id}/editar`} className="inline-flex p-2 text-zinc-400 hover:text-blue-600 transition-colors rounded-md hover:bg-blue-50">
                        <Edit2 className="w-4 h-4" />
                      </Link>
                      <VentaExternaActions id={venta.id} estado={venta.estado} />
                    </td>
                  )}
                </tr>
              ))}
              {!ventas?.length && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-6 py-8 text-center text-zinc-500">
                    No hay ventas externas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tarjetas móvil */}
      <div className="md:hidden space-y-3">
        {!ventas?.length ? (
          <div className="bg-white p-6 rounded-xl border border-zinc-200 text-center text-zinc-500">
            No hay ventas externas registradas.
          </div>
        ) : (
          ventas.map((venta) => (
            <div
              key={venta.id}
              className={`bg-white p-4 rounded-xl border border-zinc-200 shadow-sm space-y-3 ${venta.estado === 'anulado' ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-zinc-900 leading-snug">{venta.concepto}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(venta.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC' })} · {venta.comprador_nombre || 'Sin comprador'}
                  </p>
                </div>
                <p className="shrink-0 text-base font-bold text-emerald-600">
                  ${Number(venta.monto).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center px-2 py-1 rounded-md font-medium bg-zinc-100 text-zinc-700 capitalize">
                    {venta.metodo_pago}
                  </span>
                  <span className="inline-flex items-center px-2 py-1 rounded-md font-medium bg-zinc-100 text-zinc-700 capitalize">
                    {venta.estado}
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/ventas-externas/${venta.id}/editar`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Editar
                    </Link>
                    <VentaExternaActions id={venta.id} estado={venta.estado} />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
