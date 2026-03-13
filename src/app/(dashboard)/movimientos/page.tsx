import { createClient } from "@/lib/supabase/server"
import { MovimientosClient } from "./MovimientosClient"

export const metadata = {
  title: 'Movimientos | Mentes Brillantes',
  description: 'Historial general de movimientos financieros',
}

export default async function MovimientosPage() {
  const supabase = await createClient()
  if (!supabase) return <div>Error de conexión a la base de datos</div>

  // Fetch asistentes for the filter dropdown
  const { data: asistentes } = await supabase
    .from('asistentes')
    .select('id, nombre')
    .order('nombre')

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Historial General</h1>
        <p className="text-zinc-500 mt-1">
          Vista unificada de todos los movimientos financieros del sistema.
        </p>
      </div>

      <MovimientosClient asistentes={asistentes || []} />
    </div>
  )
}
