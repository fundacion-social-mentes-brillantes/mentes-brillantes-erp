import { formatearFechaIso } from '@/lib/utils/fechas'
import Link from 'next/link'
import { Edit2, Plus } from 'lucide-react'
import { requireRoles } from '@/lib/utils/authz'
import { VentaExternaActions } from './VentaExternaActions'
import { pesos } from '@/lib/utils/pesos'
import { estadoLegible, metodoPagoLegible } from '@/lib/utils/textos'

export default async function VentasExternasPage() {
  const { supabase, perfil } = await requireRoles(['admin', 'caja'])
  const isAdmin = perfil.rol === 'admin'
  const { data: ventas } =
    (await supabase?.from('ventas_externas').select('*').order('fecha', { ascending: false })) || { data: [] }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Ventas Externas</h1>
          <p className="text-gris text-sm">Ingresos por productos o servicios sin cuenta por cobrar asociada.</p>
        </div>
        <Link
          href="/ventas-externas/nueva"
          className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-acento px-4 text-sm font-semibold text-sobre-acento transition-colors hover:bg-acento-fuerte sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva venta externa
        </Link>
      </div>

      <div className="hidden md:block rounded-2xl border border-linea bg-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="border-b border-linea">
              <tr>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Concepto</th>
                <th className="px-5 py-3">Comprador</th>
                <th className="px-5 py-3">Método</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Monto</th>
                {isAdmin && <th className="px-5 py-3 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {ventas?.map((venta) => (
                <tr key={venta.id} className={venta.estado === 'anulado' ? 'opacity-60' : 'hover:bg-suave/50'}>
                  <td className="px-5 py-3 text-gris">{formatearFechaIso(venta.fecha)}</td>
                  <td className="px-5 py-3 font-medium text-tinta">{venta.concepto}</td>
                  <td className="px-5 py-3 text-gris">{venta.comprador_nombre || 'Sin comprador'}</td>
                  <td className="px-5 py-3 text-gris">{metodoPagoLegible(venta.metodo_pago)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${venta.estado === 'anulado' ? 'bg-rojo/10 text-rojo' : 'bg-verde/10 text-verde'}`}>
                      {estadoLegible(venta.estado)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-verde">
                    {pesos(Number(venta.monto))}
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-3 text-right space-x-2">
                      <Link href={`/ventas-externas/${venta.id}/editar`} prefetch={false} className="inline-flex p-2 text-gris hover:text-info transition-colors rounded-md hover:bg-info/10">
                        <Edit2 className="w-4 h-4" />
                      </Link>
                      <VentaExternaActions id={venta.id} estado={venta.estado} />
                    </td>
                  )}
                </tr>
              ))}
              {!ventas?.length && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-6 py-8 text-center text-gris">
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
          <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6 text-center text-gris">
            No hay ventas externas registradas.
          </div>
        ) : (
          ventas.map((venta) => (
            <div
              key={venta.id}
              className={`bg-panel p-4 rounded-xl border border-linea space-y-3 ${venta.estado === 'anulado' ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-tinta leading-snug">{venta.concepto}</p>
                  <p className="text-xs text-gris">
                    {formatearFechaIso(venta.fecha)} · {venta.comprador_nombre || 'Sin comprador'}
                  </p>
                </div>
                <p className="shrink-0 text-base font-bold text-verde">
                  {pesos(Number(venta.monto))}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center px-2 py-1 rounded-md font-medium bg-suave-2 text-tinta">
                    {metodoPagoLegible(venta.metodo_pago)}
                  </span>
                  <span className={`inline-flex items-center px-2 py-1 rounded-md font-medium ${venta.estado === 'anulado' ? 'bg-rojo/10 text-rojo' : 'bg-verde/10 text-verde'}`}>
                    {estadoLegible(venta.estado)}
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/ventas-externas/${venta.id}/editar`} prefetch={false}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-linea px-3 py-2 text-xs font-medium text-tinta hover:bg-suave transition-colors"
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
