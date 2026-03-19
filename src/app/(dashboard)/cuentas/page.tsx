import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CuentasClient } from './CuentasClient'

export default async function CuentasPage() {
  const supabase = await createClient()

  if (!supabase) return null

  const { data: cuentasData } = await supabase
    .from('cuentas_por_cobrar')
    .select(`
      id,
      concepto,
      fecha_emision,
      estado,
      valor_total,
      asistente_id,
      asistentes ( nombre ),
      pagos_abonos ( monto, fecha_pago, metodo_pago, notas )
    `)
    .order('fecha_emision', { ascending: false })

  const cuentas = (cuentasData ?? []).map((cuenta: any) => {
    const valor_total = Number(cuenta.valor_total)
    const pagosValidos = cuenta.pagos_abonos?.filter(
      (pago: any) => !pago.notas?.includes('[ANULADO]')
    ) ?? []
    const total_abonado = pagosValidos.reduce(
      (sum: number, pago: any) => sum + Number(pago.monto),
      0
    )
    const monto_pendiente = valor_total - total_abonado
    return {
      id: cuenta.id,
      concepto: cuenta.concepto,
      fecha_emision: cuenta.fecha_emision,
      estado: cuenta.estado,
      valor_total,
      asistente_id: cuenta.asistente_id,
      asistente_nombre: cuenta.asistentes?.nombre ?? null,
      abonos: cuenta.pagos_abonos ?? [],
      saldos: { valor_total, total_abonado, monto_pendiente },
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Cuentas por Cobrar</h1>
          <p className="text-zinc-500 text-sm">Gestiona las deudas de los asistentes y sus pagos.</p>
        </div>
        <Link
          href="/cuentas/nueva"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva Cuenta
        </Link>
      </div>

      <CuentasClient cuentas={cuentas} />
    </div>
  )
}
