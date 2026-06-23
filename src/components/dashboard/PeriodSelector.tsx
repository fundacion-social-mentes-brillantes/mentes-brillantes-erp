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
    <div className="flex items-center gap-2 bg-[rgba(var(--surface-1),0.78)] border border-[rgba(var(--border),0.68)] rounded-xl px-3 py-2 shadow-soft backdrop-blur-md">
      <CalendarRange className="w-4 h-4 text-[rgb(var(--warning))] shrink-0" />
      <select
        value={currentId ?? periodos[0]?.id}
        onChange={(e) => router.push(`/?periodo=${e.target.value}`)}
        className="text-sm font-semibold text-[rgb(var(--text-primary))] bg-transparent border-none focus:ring-0 p-0 pr-1 cursor-pointer outline-none max-w-[16rem]"
        aria-label="Seleccionar período de liquidación"
      >
        {periodos.map((p) => (
          <option key={p.id} value={p.id} className="text-[rgb(var(--text-primary))] bg-[rgb(var(--surface-1))]">
            {p.nombre} ({fmt(p.fecha_inicio)}–{fmt(p.fecha_fin)}){p.estado === 'cerrado' ? ' · cerrado' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
