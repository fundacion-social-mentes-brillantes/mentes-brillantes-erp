import Link from 'next/link'
import { Plus, Edit2, UserX, UserCheck, Search, Eye } from 'lucide-react'
import { toggleAsistenteEstado } from './actions'
import { DeleteButton } from './DeleteButton'
import { requireRoles } from '@/lib/utils/authz'

export default async function AsistentesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const q = params.q || '';
  const { supabase } = await requireRoles(['admin', 'caja'])
  
  let query = supabase?.from('asistentes').select('*')
  
  if (q && query) {
    query = query.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%,cedula.ilike.%${q}%`)
  }
  
  const { data: rawAsistentes } = await query || { data: [] }

  // Ordenar en memoria: 
  // 1. Código ascendente (numérico)
  // 2. Nombre ascendente
  // 3. Códigos vacíos o no numéricos al final
  const asistentes = (rawAsistentes || []).sort((a, b) => {
    const valA = a.codigo ? parseInt(a.codigo, 10) : null;
    const valB = b.codigo ? parseInt(b.codigo, 10) : null;
    
    const isANull = valA === null || isNaN(valA);
    const isBNull = valB === null || isNaN(valB);
    
    if (isANull && !isBNull) return 1;
    if (!isANull && isBNull) return -1;
    
    if (!isANull && !isBNull && valA !== valB) {
      return valA - valB;
    }
    
    // Criterio secundario: nombre
    return (a.nombre || '').localeCompare(b.nombre || '');
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Asistentes</h1>
          <p className="text-zinc-500">Gestiona los asistentes y pacientes del centro.</p>
        </div>
        <div className="flex items-center gap-4">
          <form className="relative" method="GET" action="/asistentes">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            <input 
              type="text" 
              name="q"
              defaultValue={q}
              placeholder="Buscar código, nombre..." 
              className="h-10 w-full sm:w-64 rounded-md border border-zinc-200 bg-white pl-9 pr-4 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
            />
          </form>
          <Link 
            href="/asistentes/nuevo" 
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo Asistente
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
              <tr>
                <th className="px-6 py-4">Código</th>
                <th className="px-6 py-4">Nombre</th>
                <th className="px-6 py-4">Cédula</th>
                <th className="px-6 py-4">Contacto</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {asistentes?.map((asistente) => (
                <tr key={asistente.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-zinc-900">{asistente.codigo || '-'}</td>
                  <td className="px-6 py-4 font-medium text-zinc-900">
                    <Link href={`/asistentes/${asistente.id}`} className="hover:text-blue-600 hover:underline">
                      {asistente.nombre}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-zinc-500">{asistente.cedula || '-'}</td>
                  <td className="px-6 py-4 text-zinc-500">
                    <div>{asistente.correo || '-'}</div>
                    <div className="text-xs">{asistente.telefono || ''}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${asistente.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                      {asistente.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-1">
                    <Link href={`/asistentes/${asistente.id}`} className="inline-flex p-2 text-zinc-400 hover:text-blue-600 transition-colors rounded-md hover:bg-blue-50" title="Ver detalle">
                      <Eye className="w-4 h-4" />
                    </Link>
                    <Link href={`/asistentes/${asistente.id}/editar`} className="inline-flex p-2 text-zinc-400 hover:text-blue-600 transition-colors rounded-md hover:bg-blue-50" title="Editar asistente">
                      <Edit2 className="w-4 h-4" />
                    </Link>
                    <form action={toggleAsistenteEstado.bind(null, asistente.id, !asistente.activo)} className="inline-block">
                      <button type="submit" title={asistente.activo ? "Desactivar asistente" : "Activar asistente"} className={`inline-flex p-2 transition-colors rounded-md ${asistente.activo ? 'text-zinc-400 hover:text-amber-600 hover:bg-amber-50' : 'text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                        {asistente.activo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </form>
                    <DeleteButton id={asistente.id} nombre={asistente.nombre} />
                  </td>
                </tr>
              ))}
              {!asistentes?.length && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                    No hay asistentes registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
