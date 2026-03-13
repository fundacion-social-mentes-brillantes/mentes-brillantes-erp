import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CreditCard, Wallet } from 'lucide-react'
import { AbonoForm } from './AbonoForm'
import { AplicarSaldoForm } from './AplicarSaldoForm'
import { EditValorModal, EditAbonoModal } from './EditModals'

export default async function DetalleCuentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  
  if (!supabase) return null

  const { data: cuenta, error } = await supabase
    .from('cuentas_por_cobrar')
    .select(`
      *,
      asistente_id,
      asistentes ( nombre, cedula ),
      pagos_abonos (*)
    `)
    .eq('id', id)
    .single()

  if (error || !cuenta) {
    console.error("Error fetching cuenta:", error);
    notFound()
  }

  const abonos = cuenta.pagos_abonos?.sort((a: any, b: any) => 
    new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime()
  ) || []

  const valor_total = Number(cuenta.valor_total)
  const total_abonado = abonos.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0)
  const monto_pendiente = valor_total - total_abonado
  const saldos = { valor_total, total_abonado, monto_pendiente }

  // Fetch saldo a favor
  const { data: movimientosSaldo } = await supabase
    .from('movimientos_saldo_favor')
    .select('tipo, monto')
    .eq('asistente_id', cuenta.asistente_id)
    
  let saldoAFavor = 0
  if (movimientosSaldo) {
    const ingresos = movimientosSaldo.filter(m => m.tipo === 'ingreso').reduce((acc, m) => acc + Number(m.monto), 0)
    const aplicaciones = movimientosSaldo.filter(m => m.tipo === 'aplicacion').reduce((acc, m) => acc + Number(m.monto), 0)
    saldoAFavor = ingresos - aplicaciones
  }

  // Check if admin
  const { data: { user } } = await supabase.auth.getUser()
  let isAdmin = false
  if (user) {
    const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
    isAdmin = perfil?.rol === 'admin'
  }

  // Fetch auditoria
  const abonoIds = abonos.map((a: any) => a.id)
  const { data: auditoria } = await supabase
    .from('auditoria_financiera')
    .select('*')
    .in('registro_id', [id, ...abonoIds])
    .order('fecha', { ascending: false })

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Link href="/cuentas" className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Detalle de Cuenta</h1>
          <p className="text-zinc-500 text-sm">Información y pagos de la cuenta por cobrar.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resumen de la Cuenta */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">{cuenta.concepto}</h2>
                <p className="text-zinc-500 text-sm">Asistente: {cuenta.asistentes?.nombre}</p>
              </div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium 
                ${cuenta.estado === 'pagado' ? 'bg-emerald-100 text-emerald-700' : 
                  cuenta.estado === 'parcial' ? 'bg-amber-100 text-amber-700' : 
                  'bg-red-100 text-red-700'}`}>
                {cuenta.estado.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4 border-y border-zinc-100">
              <div>
                <p className="text-sm text-zinc-500">Valor Total</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-semibold text-zinc-900">${Number(saldos.valor_total).toLocaleString()}</p>
                  {isAdmin && <EditValorModal cuentaId={cuenta.id} valorActual={Number(saldos.valor_total)} />}
                </div>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Total Abonado</p>
                <p className="text-xl font-semibold text-emerald-600">${Number(saldos.total_abonado).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Saldo Pendiente</p>
                <p className="text-xl font-semibold text-red-600">${Number(saldos.monto_pendiente).toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-4 text-sm text-zinc-500">
              Fecha de emisión: {new Date(cuenta.fecha_emision).toLocaleDateString()}
            </div>
          </div>

          {/* Historial de Abonos */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-zinc-200 bg-zinc-50">
              <h3 className="font-semibold text-zinc-900">Historial de Abonos</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-zinc-50/50 border-b border-zinc-100 text-zinc-500 font-medium">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {abonos.map((abono: any) => (
                    <tr key={abono.id} className="hover:bg-zinc-50/50">
                      <td className="px-4 py-3 text-zinc-900">{new Date(abono.fecha_pago).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-zinc-500 capitalize">
                        {abono.origen_fondos === 'saldo_a_favor' ? 'Saldo a favor' : abono.metodo_pago}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">
                        <div className="flex items-center justify-end gap-2">
                          ${Number(abono.monto).toLocaleString()}
                          {isAdmin && <EditAbonoModal abonoId={abono.id} cuentaId={cuenta.id} valorActual={Number(abono.monto)} />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs truncate max-w-[150px]">{abono.notas || '-'}</td>
                    </tr>
                  ))}
                  {!abonos.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                        No hay abonos registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Formulario de Nuevo Abono */}
        <div className="lg:col-span-1 space-y-6">
          {cuenta.estado !== 'pagado' ? (
            <>
              {saldoAFavor > 0 && (
                <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-5 h-5 text-emerald-600" />
                    <h3 className="font-semibold text-emerald-900">Saldo a Favor Disponible</h3>
                  </div>
                  <p className="text-2xl font-bold text-emerald-700 mb-4">${saldoAFavor.toLocaleString('es-CO')}</p>
                  <AplicarSaldoForm 
                    cuentaId={cuenta.id} 
                    asistenteId={cuenta.asistente_id} 
                    maxMonto={Math.min(saldoAFavor, saldos.monto_pendiente)} 
                  />
                </div>
              )}

              <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm sticky top-6">
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className="w-5 h-5 text-zinc-400" />
                  <h3 className="font-semibold text-zinc-900">Registrar Abono</h3>
                </div>
                <AbonoForm cuentaId={cuenta.id} maxMonto={saldos.monto_pendiente} />
              </div>
            </>
          ) : (
            <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-200 text-center">
              <h3 className="font-semibold text-emerald-800 mb-2">Cuenta Pagada</h3>
              <p className="text-sm text-emerald-600">Esta cuenta no tiene saldo pendiente.</p>
            </div>
          )}
        </div>
      </div>

      {isAdmin && auditoria && auditoria.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden mt-6">
          <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
            <h3 className="font-medium text-zinc-900">Historial de Correcciones (Admin)</h3>
          </div>
          <div className="divide-y divide-zinc-100">
            {auditoria.map((aud: any) => (
              <div key={aud.id} className="p-4 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="font-medium text-zinc-900">
                    {aud.accion === 'edicion_valor' ? 'Edición de Valor Total' : 'Edición de Abono'}
                  </span>
                  <span className="text-zinc-500">{new Date(aud.fecha).toLocaleString('es-CO')}</span>
                </div>
                <div className="text-zinc-600 mb-1">
                  Cambio: <span className="line-through text-red-500">${Number(aud.valor_anterior).toLocaleString('es-CO')}</span> 
                  {' -> '} <span className="text-emerald-600 font-medium">${Number(aud.valor_nuevo).toLocaleString('es-CO')}</span>
                </div>
                <div className="text-zinc-500 italic">Motivo: {aud.motivo}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
