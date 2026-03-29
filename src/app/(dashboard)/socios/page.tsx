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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Socios</h1>
          <p className="text-zinc-500">Gestiona los socios y sus porcentajes de participación.</p>
        </div>
        <Link 
          href="/socios/nuevo" 
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2"
        >
          <Plus className="w-4 h-4" />
          Nuevo Socio
        </Link>
      </div>

      <div className="hidden md:block rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
              <tr>
                <th className="px-6 py-4">Nombre</th>
                <th className="px-6 py-4">Participación</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {socios?.map((socio) => (
                <tr key={socio.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-zinc-900">{socio.nombre}</td>
                  <td className="px-6 py-4 text-zinc-500">{socio.porcentaje_participacion}%</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${socio.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                      {socio.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Link href={`/socios/${socio.id}/editar`} className="inline-flex p-2 text-zinc-400 hover:text-blue-600 transition-colors rounded-md hover:bg-blue-50">
                      <Edit2 className="w-4 h-4" />
                    </Link>
                    <form action={toggleSocioEstado.bind(null, socio.id, !socio.activo)} className="inline-block">
                      <button type="submit" className={`inline-flex p-2 transition-colors rounded-md ${socio.activo ? 'text-zinc-400 hover:text-red-600 hover:bg-red-50' : 'text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                        {socio.activo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {!socios?.length && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
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
          <div className="bg-white p-6 rounded-xl border border-zinc-200 text-center text-zinc-500">
            No hay socios registrados.
          </div>
        ) : (
          socios.map((socio) => (
            <div key={socio.id} className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-semibold text-zinc-900 leading-snug">{socio.nombre}</p>
                  <p className="text-sm text-zinc-500">ParticipaciÃ³n: {socio.porcentaje_participacion}%</p>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${socio.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                    {socio.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <Link
                  href={`/socios/${socio.id}/editar`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Editar
                </Link>
              </div>

              <form action={toggleSocioEstado.bind(null, socio.id, !socio.activo)} className="w-full">
                <button
                  type="submit"
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${socio.activo ? 'text-red-600 bg-red-50 border border-red-200 hover:bg-red-100' : 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'}`}
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
