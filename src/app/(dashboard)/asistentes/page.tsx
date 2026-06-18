import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireRoles } from '@/lib/utils/authz'
import { estadoPorActividad } from '@/lib/utils/asistentes'
import { AsistentesClient } from './AsistentesClient'

export default async function AsistentesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams
  const q = params.q || ''
  const { supabase } = await requireRoles(['admin', 'caja'])

  // Se carga la lista completa una vez; el filtrado por código/nombre/cédula
  // ocurre en el cliente en tiempo real (sin recargar). Se asume un volumen
  // moderado de asistentes (< 1000, tope por defecto de PostgREST); si crece
  // por encima de eso habría que paginar o reintroducir un filtro server-side.
  const { data: rawAsistentes } = await supabase
    .from('asistentes')
    .select(`
        id, nombre, cedula, correo, telefono, codigo, activo, fecha_registro, fecha_inicio_proceso, creado_en,
        cuentas_por_cobrar (fecha_emision, pagos_abonos (fecha_pago)),
        movimientos_saldo_favor (fecha),
        donaciones_asistentes (fecha),
        coach_sesiones (fecha)
      `)
    .order('nombre')

  const asistentes = (rawAsistentes || [])
    .map((a: any) => {
      const { ultima_actividad, activo } = estadoPorActividad(a)
      return {
        id: a.id,
        nombre: a.nombre,
        cedula: a.cedula ?? null,
        correo: a.correo ?? null,
        telefono: a.telefono ?? null,
        codigo: a.codigo ?? null,
        activo: a.activo,
        activo_visible: activo,
        ultima_actividad,
      }
    })
    .sort((a: any, b: any) => {
      const valA = a.codigo ? parseInt(a.codigo, 10) : null
      const valB = b.codigo ? parseInt(b.codigo, 10) : null

      const isANull = valA === null || isNaN(valA)
      const isBNull = valB === null || isNaN(valB)

      if (isANull && !isBNull) return 1
      if (!isANull && isBNull) return -1
      if (!isANull && !isBNull && valA !== valB) return valA - valB

      return (a.nombre || '').localeCompare(b.nombre || '')
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--text-primary))]">Asistentes</h1>
          <p className="text-[rgb(var(--text-muted))] text-sm">Gestiona los asistentes y pacientes del centro.</p>
        </div>
        <Link
          href="/asistentes/nuevo"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-[rgb(var(--surface-3))] text-[rgb(var(--text-primary))] border border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))] h-10 px-4 py-2 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Nuevo Asistente
        </Link>
      </div>

      <AsistentesClient asistentes={asistentes} initialQuery={q} />
    </div>
  )
}
