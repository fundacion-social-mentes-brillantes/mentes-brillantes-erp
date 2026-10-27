import Link from 'next/link'
import { CalendarHeart, Plus } from 'lucide-react'
import { requireRoles } from '@/lib/utils/authz'
import { listarTalleres } from '@/lib/operaciones/talleres'
import { formatearFechaEvento } from '@/lib/utils/fechas'
import { pesos } from '@/lib/utils/pesos'
import { ChipEstadoTaller } from './piezas'

export default async function TalleresPage() {
  const { supabase, perfil } = await requireRoles(['admin', 'caja'])
  const isAdmin = perfil.rol === 'admin'
  const talleres = await listarTalleres(supabase)

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Talleres</h1>
          <p className="text-sm text-gris">
            Talleres, encuentros y eventos, cada uno con sus cuentas aparte. Lo que se cobra entra a la fundación como
            todo lo demás.
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/talleres/nuevo"
            className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-acento px-4 text-sm font-semibold text-sobre-acento transition-colors hover:bg-acento-fuerte sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Nuevo taller
          </Link>
        )}
      </div>

      {talleres.length === 0 ? (
        <div className="rounded-2xl border border-linea bg-panel px-6 py-12 text-center">
          <CalendarHeart className="mx-auto h-8 w-8 text-gris" aria-hidden />
          <p className="mt-3 font-semibold text-tinta">Todavía no hay talleres</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gris">
            {isAdmin
              ? 'Crea el primero: le pones nombre, fecha y valor, y desde ahí inscribes a la gente, cobras y marcas quién llegó.'
              : 'Cuando el administrador cree uno, aparecerá aquí.'}
          </p>
        </div>
      ) : (
        <>
          {/* Computador */}
          <div className="hidden overflow-hidden rounded-2xl border border-linea bg-panel md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-linea">
                <tr>
                  <th className="px-5 py-3">Taller</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Inscritos</th>
                  <th className="px-5 py-3 text-right">Recaudado</th>
                  <th className="px-5 py-3 text-right">Por cobrar</th>
                  {isAdmin && <th className="px-5 py-3 text-right">Gastos</th>}
                  {isAdmin && <th className="px-5 py-3 text-right">Queda</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {talleres.map(({ taller, resumen }) => (
                  <tr key={taller.id} className="hover:bg-suave/50">
                    <td className="px-5 py-3">
                      <Link href={`/talleres/${taller.id}`} prefetch={false} className="font-semibold text-tinta hover:text-acento">
                        {taller.nombre}
                      </Link>
                      <p className="text-xs text-gris">{formatearFechaEvento(taller.fecha_inicio, 'Sin fecha', true)}</p>
                    </td>
                    <td className="px-5 py-3">
                      <ChipEstadoTaller estado={taller.estado} />
                    </td>
                    <td className="px-5 py-3 text-right text-tinta">
                      {resumen.inscritos}
                      {taller.cupo ? <span className="text-gris"> / {taller.cupo}</span> : null}
                      {resumen.asistieron > 0 && <p className="text-xs text-gris">llegaron {resumen.asistieron}</p>}
                    </td>
                    <td className="cifra px-5 py-3 text-right font-semibold text-verde">{pesos(resumen.recaudado)}</td>
                    <td className="cifra px-5 py-3 text-right text-ambar">
                      {resumen.porCobrar > 0 ? pesos(resumen.porCobrar) : <span className="text-gris">—</span>}
                    </td>
                    {isAdmin && (
                      <td className="cifra px-5 py-3 text-right text-rojo">
                        {resumen.gastos > 0 ? pesos(resumen.gastos) : <span className="text-gris">—</span>}
                      </td>
                    )}
                    {isAdmin && (
                      <td className={`cifra px-5 py-3 text-right font-semibold ${resumen.resultado < 0 ? 'text-rojo' : 'text-tinta'}`}>
                        {pesos(resumen.resultado)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: una sola tarjeta con filas separadas por líneas */}
          <div className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-panel md:hidden">
            {talleres.map(({ taller, resumen }) => (
              <Link key={taller.id} href={`/talleres/${taller.id}`} prefetch={false} className="block px-4 py-4 active:bg-suave">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug text-tinta">{taller.nombre}</p>
                    <p className="mt-0.5 text-xs text-gris">{formatearFechaEvento(taller.fecha_inicio, 'Sin fecha', true)}</p>
                  </div>
                  <ChipEstadoTaller estado={taller.estado} />
                </div>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                  <span className="text-gris">
                    <span className="font-semibold text-tinta">{resumen.inscritos}</span> inscritos
                  </span>
                  <span className="cifra font-semibold text-verde">{pesos(resumen.recaudado)}</span>
                  {resumen.porCobrar > 0 && <span className="cifra text-ambar">faltan {pesos(resumen.porCobrar)}</span>}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
