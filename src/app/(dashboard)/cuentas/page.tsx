import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Eye, AlertCircle } from 'lucide-react'

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
      asistentes ( nombre ),
      pagos_abonos ( monto )
    `)
    .order('fecha_emision', { ascending: false }) || { data: [] }

  const cuentas = cuentasData?.map((cuenta: any) => {
    const valor_total = Number(cuenta.valor_total)
    const total_abonado = cuenta.pagos_abonos?.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0) || 0
    const monto_pendiente = valor_total - total_abonado
    return {
      ...cuenta,
      saldos: { valor_total, total_abonado, monto_pendiente }
    }
  }) || []

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

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
              <tr>
                <th className="px-6 py-4">Asistente</th>
                <th className="px-6 py-4">Concepto</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4 text-right">Total</th>
                <th className="px-6 py-4 text-right">Pendiente</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {cuentas.map((cuenta: any) => {
                const saldos = cuenta.saldos;
                return (
                  <tr key={cuenta.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-zinc-900">{cuenta.asistentes?.nombre}</td>
                    <td className="px-6 py-4 text-zinc-500">{cuenta.concepto}</td>
                    <td className="px-6 py-4 text-zinc-500">{new Date(cuenta.fecha_emision).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right text-zinc-900 font-medium">
                      ${Number(saldos.valor_total).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-red-600 font-medium">
                      ${Number(saldos.monto_pendiente).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium 
                        ${cuenta.estado === 'pagado' ? 'bg-emerald-100 text-emerald-700' : 
                          cuenta.estado === 'parcial' ? 'bg-amber-100 text-amber-700' : 
                          'bg-red-100 text-red-700'}`}>
                        {cuenta.estado.charAt(0).toUpperCase() + cuenta.estado.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      {cuenta.estado !== 'pagado' && (
                        <Link 
                          href={`/cuentas/${cuenta.id}`} 
                          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-colors bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 h-8 px-3"
                          title="Registrar abono"
                        >
                          Registrar abono
                        </Link>
                      )}
                      <Link 
                        href={`/cuentas/${cuenta.id}`} 
                        className="inline-flex p-2 text-zinc-400 hover:text-blue-600 transition-colors rounded-md hover:bg-blue-50"
                        title="Ver detalles"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {!cuentas?.length && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">
                    No hay cuentas por cobrar registradas.
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
