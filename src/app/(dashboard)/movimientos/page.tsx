import { MovimientosClient } from "./MovimientosClient"
import { TrasladosCuentas, type TrasladoFila } from "./TrasladosCuentas"
import { requireRoles } from "@/lib/utils/authz"
import { listarTraslados } from "@/lib/operaciones/traslados"
import { fechaHoyBogota } from "@/lib/utils/fechas"

export const metadata = {
  title: 'Movimientos | Mentes Brillantes',
  description: 'Historial general de movimientos financieros',
}

export default async function MovimientosPage() {
  const { supabase, perfil } = await requireRoles(['admin', 'caja'])

  const [{ data: asistentes }, traslados] = await Promise.all([
    supabase.from('asistentes').select('id, nombre').order('nombre'),
    listarTraslados(supabase, { limite: 30 }).catch((error) => {
      console.error('[movimientos] no se pudieron leer los traslados', error)
      return []
    }),
  ])

  const isAdmin = perfil.rol === 'admin'
  const filas: TrasladoFila[] = traslados.map((t) => ({
    id: t.id,
    fecha: t.fecha,
    monto: Number(t.monto),
    metodo_origen: t.metodo_origen,
    metodo_destino: t.metodo_destino,
    notas: t.notas,
    estado: t.estado,
    motivo_anulacion: t.motivo_anulacion,
  }))

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Historial General</h1>
        <p className="text-gris mt-1">
          Vista unificada de todos los movimientos financieros del sistema.
        </p>
      </div>

      <MovimientosClient asistentes={asistentes || []} isAdmin={isAdmin} />

      <TrasladosCuentas traslados={filas} isAdmin={isAdmin} hoy={fechaHoyBogota()} />
    </div>
  )
}
