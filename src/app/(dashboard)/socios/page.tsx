import Link from 'next/link'
import { Plus, Edit2, UserX, UserCheck } from 'lucide-react'
import { toggleSocioEstado } from './actions'
import { requireRoles } from '@/lib/utils/authz'

export default async function SociosPage() {
  const { supabase } = await requireRoles(['admin'])
  const { data: socios } = await supabase?.from('socios').select('*').order('nombre') || { data: [] }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Socios</h1>
          <p className="text-gris">Gestiona los socios y sus porcentajes de participación.</p>
        </div>
        <Link 
          href="/socios/nuevo" 
          className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-acento px-4 text-sm font-semibold text-sobre-acento transition-colors hover:bg-acento-fuerte disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Nuevo Socio
        </Link>
      </div>

      <div className="hidden md:block rounded-2xl border border-linea bg-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-linea">
              <tr>
                <th className="px-5 py-3">Nombre</th>
                <th className="px-5 py-3">Participación</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {socios?.map((socio) => (
                <tr key={socio.id} className="hover:bg-suave/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-tinta">{socio.nombre}</td>
                  <td className="px-5 py-3 text-gris">{socio.porcentaje_participacion}%</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${socio.activo ? 'bg-verde/15 text-verde' : 'bg-suave-2 text-gris'}`}>
                      {socio.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right space-x-2">
                    <Link href={`/socios/${socio.id}/editar`} prefetch={false} title="Editar socio" aria-label={`Editar a ${socio.nombre}`} className="inline-flex p-2 text-gris hover:text-info transition-colors rounded-md hover:bg-info/10">
                      <Edit2 className="w-4 h-4" />
                    </Link>
                    <form action={toggleSocioEstado.bind(null, socio.id, !socio.activo)} className="inline-block">
                      <button type="submit" title={socio.activo ? 'Desactivar socio' : 'Activar socio'} aria-label={`${socio.activo ? 'Desactivar' : 'Activar'} a ${socio.nombre}`} className={`inline-flex p-2 transition-colors rounded-md ${socio.activo ? 'text-gris hover:text-rojo hover:bg-rojo/10' : 'text-gris hover:text-verde hover:bg-verde/10'}`}>
                        {socio.activo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {!socios?.length && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gris">
                    No hay socios registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {!socios?.length ? (
          <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6 text-center text-gris">
            No hay socios registrados.
          </div>
        ) : (
          socios.map((socio) => (
            <div key={socio.id} className="bg-panel p-4 rounded-xl border border-linea space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-semibold text-tinta leading-snug">{socio.nombre}</p>
                  <p className="text-sm text-gris">Participación: {socio.porcentaje_participacion}%</p>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${socio.activo ? 'bg-verde/15 text-verde' : 'bg-suave-2 text-gris'}`}>
                    {socio.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <Link
                  href={`/socios/${socio.id}/editar`} prefetch={false}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-linea px-3 py-2 text-xs font-medium text-tinta hover:bg-suave transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Editar
                </Link>
              </div>

              <form action={toggleSocioEstado.bind(null, socio.id, !socio.activo)} className="w-full">
                <button
                  type="submit"
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${socio.activo ? 'text-rojo bg-rojo/10 border border-rojo/30 hover:bg-rojo/15' : 'text-verde bg-verde/10 border border-verde/30 hover:bg-verde/15'}`}
                >
                  {socio.activo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  {socio.activo ? 'Desactivar' : 'Activar'}
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
