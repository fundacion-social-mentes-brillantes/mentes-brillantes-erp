'use client'

import { useRouter } from 'next/navigation'
import { CalendarRange } from 'lucide-react'

type PeriodoOpcion = {
  id: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  estado: string
}

function fmt(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

// Selector de la liquidación (período) que alimenta el Dashboard.
// Abre por defecto en el último; permite mirar períodos anteriores.
export function PeriodSelector({
  periodos,
  currentId,
}: {
  periodos: PeriodoOpcion[]
  currentId?: string
}) {
  const router = useRouter()

  if (!periodos.length) return null

  return (
    <div className="flex h-10 min-w-0 max-w-full items-center gap-2 rounded-2xl border border-linea bg-panel px-3 transition-colors hover:border-linea-fuerte">
      <CalendarRange className="h-4 w-4 shrink-0 text-gris" aria-hidden />
      <select
        value={currentId ?? periodos[0]?.id}
        onChange={(e) => router.push(`/?periodo=${e.target.value}`)}
        className="text-sm font-semibold text-tinta bg-transparent border-none focus:ring-0 p-0 pr-1 cursor-pointer outline-none min-w-0 max-w-[16rem] truncate"
        aria-label="Seleccionar período de liquidación"
      >
        {periodos.map((p) => (
          <option key={p.id} value={p.id} className="text-tinta bg-panel">
            {p.nombre} ({fmt(p.fecha_inicio)}–{fmt(p.fecha_fin)}){p.estado === 'cerrado' ? ' · cerrado' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
