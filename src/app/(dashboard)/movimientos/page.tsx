import { MovimientosClient } from "./MovimientosClient"
import { requireRoles } from "@/lib/utils/authz"

export const metadata = {
  title: 'Movimientos | Mentes Brillantes',
  description: 'Historial general de movimientos financieros',
}

export default async function MovimientosPage() {
  const { supabase, perfil } = await requireRoles(['admin', 'caja'])

  const { data: asistentes } = await supabase
    .from('asistentes')
    .select('id, nombre')
    .order('nombre')

  const isAdmin = perfil.rol === 'admin'

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--text-primary))]">Historial General</h1>
        <p className="text-[rgb(var(--text-muted))] mt-1">
          Vista unificada de todos los movimientos financieros del sistema.
        </p>
      </div>

      <MovimientosClient asistentes={asistentes || []} isAdmin={isAdmin} />
    </div>
  )
}
