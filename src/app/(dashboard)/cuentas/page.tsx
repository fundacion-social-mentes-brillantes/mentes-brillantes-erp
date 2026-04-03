import { requireRoles } from '@/lib/utils/authz'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CuentasClient } from './CuentasClient'
import { filtrarPagosValidos, sumarMontos } from '@/lib/utils/contable'

export default async function CuentasPage() {
  const { supabase, perfil } = await requireRoles(['admin', 'caja'])
  const isAdmin = perfil.rol === 'admin'

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
      pagos_abonos ( monto, fecha_pago, metodo_pago, estado, notas )
    `)
    .order('fecha_emision', { ascending: false })

  const cuentas = (cuentasData ?? []).map((cuenta: any) => {
    const valor_total = Number(cuenta.valor_total)
    const pagosValidos = filtrarPagosValidos(cuenta.pagos_abonos ?? [])
    const total_abonado = sumarMontos(pagosValidos)
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
          <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--text-primary))]">Cuentas por Cobrar</h1>
          <p className="text-[rgb(var(--text-muted))] text-sm">Gestiona las deudas de los asistentes y sus pagos.</p>
        </div>
        <Link
          href="/cuentas/nueva"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-[rgb(var(--surface-3))] text-[rgb(var(--text-primary))] border border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))] h-10 px-4 py-2 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva Cuenta
        </Link>
      </div>

      <CuentasClient cuentas={cuentas} isAdmin={isAdmin} />
    </div>
  )
}
