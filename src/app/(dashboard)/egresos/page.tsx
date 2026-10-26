import { formatearFechaIso } from '@/lib/utils/fechas'
import Link from 'next/link'
import { Plus, Edit2 } from 'lucide-react'
import { DeleteEgresoButton } from './DeleteEgresoButton'
import { requireRoles } from '@/lib/utils/authz'
import { pesos } from '@/lib/utils/pesos'

// Se pide una pagina a la vez, igual que en Cuentas: la lista crecia para
// siempre y se bajaba entera en cada carga.
const POR_PAGINA = 100

type Params = { searchParams: Promise<{ pagina?: string }> }

export default async function EgresosPage({ searchParams }: Params) {
  const { supabase } = await requireRoles(['admin', 'caja'])

  const { pagina } = await searchParams
  const paginaActual = Math.max(1, Number(pagina) || 1)
  const desde = (paginaActual - 1) * POR_PAGINA

  const { data: egresos, count } =
    (await supabase
      ?.from('egresos')
      .select('id, fecha, concepto, categoria, metodo_pago, monto, notas', { count: 'exact' })
      .order('fecha', { ascending: false })
      .order('id', { ascending: false }) // desempate: sin el, filas de la misma fecha se repetian o se perdian entre paginas
      .range(desde, desde + POR_PAGINA - 1)) || { data: [], count: 0 }

  const total = count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const primero = total === 0 ? 0 : desde + 1
  const ultimo = Math.min(desde + POR_PAGINA, total)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Egresos</h1>
          <p className="text-gris text-sm">Registro de gastos operativos y administrativos.</p>
        </div>
        <Link 
          href="/egresos/nuevo" 
          className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-acento px-4 text-sm font-semibold text-sobre-acento transition-colors hover:bg-acento-fuerte sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Nuevo Egreso
        </Link>
      </div>

      <div className="hidden md:block rounded-2xl border border-linea bg-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="border-b border-linea">
              <tr>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Concepto</th>
                <th className="px-5 py-3">Categoría</th>
                <th className="px-5 py-3">Método</th>
                <th className="px-5 py-3 text-right">Monto</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {egresos?.map((egreso) => (
                <tr key={egreso.id} className="hover:bg-suave/50 transition-colors">
                  <td className="px-5 py-3 text-gris">{formatearFechaIso(egreso.fecha)}</td>
                  <td className="px-5 py-3 font-medium text-tinta">{egreso.concepto}</td>
                  <td className="px-5 py-3 text-gris">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-suave-2 text-tinta">
                      {egreso.categoria}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gris capitalize">{egreso.metodo_pago}</td>
                  <td className="px-5 py-3 text-right font-medium text-rojo">
                    {pesos(Number(egreso.monto))}
                  </td>
                  <td className="px-5 py-3 text-right space-x-2">
                    <Link href={`/egresos/${egreso.id}/editar`} prefetch={false} className="inline-flex p-2 text-gris hover:text-info transition-colors rounded-md hover:bg-info/10">
                      <Edit2 className="w-4 h-4" />
                    </Link>
                    <DeleteEgresoButton id={egreso.id} />
                  </td>
                </tr>
              ))}
              {!egresos?.length && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gris">
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
          <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6 text-center text-gris">
            No hay egresos registrados.
          </div>
        ) : (
          egresos.map((egreso) => (
            <div key={egreso.id} className="bg-panel p-4 rounded-xl border border-linea space-y-3">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <p className="text-sm text-gris">{formatearFechaIso(egreso.fecha)}</p>
                  <p className="font-semibold text-tinta leading-snug">{egreso.concepto}</p>
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-suave-2 text-tinta">
                    {egreso.categoria}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gris capitalize">{egreso.metodo_pago}</p>
                  <p className="font-bold text-rojo text-lg">{pesos(Number(egreso.monto))}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Link
                  href={`/egresos/${egreso.id}/editar`} prefetch={false}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-linea px-3 py-2 text-sm font-medium text-tinta hover:bg-suave transition-colors"
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

      {total > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
          <p className="text-gris">
            Mostrando {primero}–{ultimo} de {total.toLocaleString('es-CO')} egresos
          </p>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-2">
              {paginaActual > 1 && (
                <Link
                  href={`/egresos?pagina=${paginaActual - 1}`}
                  className="inline-flex items-center rounded-md border border-linea px-3 py-2 font-medium text-tinta hover:bg-suave transition-colors"
                >
                  Anterior
                </Link>
              )}
              <span className="text-gris">
                Página {paginaActual} de {totalPaginas}
              </span>
              {paginaActual < totalPaginas && (
                <Link
                  href={`/egresos?pagina=${paginaActual + 1}`}
                  className="inline-flex items-center rounded-md border border-linea px-3 py-2 font-medium text-tinta hover:bg-suave transition-colors"
                >
                  Siguiente
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
