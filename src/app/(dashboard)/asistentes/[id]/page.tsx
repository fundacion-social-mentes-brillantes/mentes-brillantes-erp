import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Edit2, Calendar, FileText, CreditCard, CheckCircle2, Clock, AlertCircle, Plus, Wallet } from 'lucide-react'
import { notFound } from 'next/navigation'
import { AnticipoForm } from './AnticipoForm'
import { PagarConSaldoButton } from './PagarConSaldoButton'

export default async function AsistenteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient()
  
  if (!supabase) return null

  // Fetch asistente
  const { data: asistente } = await supabase
    .from('asistentes')
    .select('*')
    .eq('id', id)
    .single()

  if (!asistente) {
    notFound()
  }

  // Fetch cuentas and their payments
  const { data: cuentas } = await supabase
    .from('cuentas_por_cobrar')
    .select(`
      *,
      pagos_abonos (*)
    `)
    .eq('asistente_id', id)
    .order('fecha_emision', { ascending: false })

  // Fetch movimientos de saldo a favor
  const { data: movimientosSaldo } = await supabase
    .from('movimientos_saldo_favor')
    .select('*')
    .eq('asistente_id', id)
    .order('fecha', { ascending: false })

  let totalIngresosSaldo = 0
  let totalAplicadoSaldo = 0
  
  const movimientos = movimientosSaldo || []
  movimientos.forEach(m => {
    if (m.tipo === 'ingreso') totalIngresosSaldo += Number(m.monto)
    if (m.tipo === 'aplicacion') totalAplicadoSaldo += Number(m.monto)
  })
  const saldoAFavor = Math.round(totalIngresosSaldo - totalAplicadoSaldo)

  // Calculate totals
  let totalFacturado = 0
  let totalAbonado = 0

  const cuentasProcesadas = (cuentas || []).map(cuenta => {
    const abonado = Math.round(cuenta.pagos_abonos?.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0) || 0)
    const pendiente = Math.round(Number(cuenta.valor_total) - abonado)
    
    totalFacturado += Number(cuenta.valor_total)
    totalAbonado += abonado

    return {
      ...cuenta,
      abonado,
      pendiente
    }
  })

  totalFacturado = Math.round(totalFacturado)
  totalAbonado = Math.round(totalAbonado)
  const saldoPendiente = Math.round(totalFacturado - totalAbonado)
  const hasMovements = cuentasProcesadas.length > 0

  // Extract all payments for the timeline
  const todosLosAbonos = (cuentas || []).flatMap(cuenta => 
    (cuenta.pagos_abonos || []).map((pago: any) => ({
      ...pago,
      concepto_cuenta: cuenta.concepto,
      cuenta_id: cuenta.id
    }))
  ).sort((a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Header & Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/asistentes" 
            className="inline-flex p-2 text-zinc-400 hover:text-zinc-900 transition-colors rounded-md hover:bg-zinc-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
              {asistente.nombre}
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${asistente.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                {asistente.activo ? 'Activo' : 'Inactivo'}
              </span>
            </h1>
            <p className="text-zinc-500 flex items-center gap-2">
              {asistente.codigo && <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-xs text-zinc-600">#{asistente.codigo}</span>}
              {asistente.cedula && <span>CC: {asistente.cedula}</span>}
            </p>
          </div>
        </div>
        <Link 
          href={`/asistentes/${asistente.id}/editar`} 
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-zinc-200 bg-white hover:bg-zinc-100 hover:text-zinc-900 h-10 px-4 py-2"
        >
          <Edit2 className="w-4 h-4" />
          Editar
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Info & Stats */}
        <div className="space-y-6 md:col-span-1">
          {/* Contact Info Card */}
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
              <h3 className="font-medium text-zinc-900">Información de Contacto</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Correo Electrónico</p>
                <p className="text-sm text-zinc-900">{asistente.correo || 'No registrado'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Teléfono</p>
                <p className="text-sm text-zinc-900">{asistente.telefono || 'No registrado'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Fecha de Registro</p>
                <p className="text-sm text-zinc-900 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  {new Date(asistente.creado_en).toLocaleDateString('es-CO')}
                </p>
              </div>
            </div>
          </div>

          {/* Financial Summary Card */}
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
              <h3 className="font-medium text-zinc-900">Resumen Financiero</h3>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Total Facturado</p>
                <p className="text-xl font-semibold text-zinc-900">
                  ${totalFacturado.toLocaleString('es-CO')}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Total Abonado</p>
                <p className="text-xl font-semibold text-emerald-600">
                  ${totalAbonado.toLocaleString('es-CO')}
                </p>
              </div>
              <div className="pt-4 border-t border-zinc-100">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Saldo Pendiente</p>
                <p className={`text-2xl font-bold ${saldoPendiente > 0 ? 'text-red-600' : 'text-zinc-900'}`}>
                  ${saldoPendiente.toLocaleString('es-CO')}
                </p>
              </div>
            </div>
          </div>

          {/* Saldo a Favor Card */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-emerald-100 bg-emerald-100/50 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-700" />
              <h3 className="font-medium text-emerald-900">Saldo a Favor</h3>
            </div>
            <div className="p-5">
              <p className="text-3xl font-bold text-emerald-700 mb-6">
                ${saldoAFavor.toLocaleString('es-CO')}
              </p>
              
              {saldoAFavor > 0 && saldoPendiente > 0 && (
                <div className="mb-6 -mt-2">
                  <PagarConSaldoButton asistenteId={asistente.id} disabled={false} />
                </div>
              )}

              <div className="pt-4 border-t border-emerald-200/50">
                <h4 className="text-sm font-medium text-emerald-900 mb-3">Registrar Anticipo</h4>
                <AnticipoForm asistenteId={asistente.id} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: History */}
        <div className="space-y-6 md:col-span-2">
          {!hasMovements ? (
            <div className="rounded-xl border border-zinc-200 bg-white shadow-sm p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 mb-4">
                <FileText className="w-6 h-6 text-zinc-400" />
              </div>
              <h3 className="text-lg font-medium text-zinc-900 mb-1">Sin movimientos</h3>
              <p className="text-zinc-500 max-w-sm mx-auto mb-6">
                Este asistente aún no tiene cuentas por cobrar ni abonos registrados en el sistema.
              </p>
              <Link 
                href={`/cuentas/nueva?asistente=${asistente.id}`}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2"
              >
                <Plus className="w-4 h-4" />
                Crear Cuenta
              </Link>
            </div>
          ) : (
            <>
              {/* Cuentas por Cobrar */}
              <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                  <h3 className="font-medium text-zinc-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-zinc-500" />
                    Cuentas por Cobrar
                  </h3>
                  <Link 
                    href={`/cuentas/nueva?asistente=${asistente.id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    + Nueva
                  </Link>
                </div>
                <div className="divide-y divide-zinc-100">
                  {cuentasProcesadas.map((cuenta) => (
                    <div key={cuenta.id} className="p-5 hover:bg-zinc-50/50 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                        <div>
                          <Link href={`/cuentas/${cuenta.id}`} className="font-medium text-zinc-900 hover:text-blue-600 hover:underline">
                            {cuenta.concepto}
                          </Link>
                          <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(cuenta.fecha_emision).toLocaleDateString('es-CO')}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-medium text-zinc-900">${Number(cuenta.valor_total).toLocaleString('es-CO')}</p>
                            {cuenta.pendiente > 0 && (
                              <p className="text-xs text-red-600 font-medium">Debe: ${cuenta.pendiente.toLocaleString('es-CO')}</p>
                            )}
                          </div>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            cuenta.estado === 'pagado' ? 'bg-emerald-100 text-emerald-700' : 
                            cuenta.estado === 'parcial' ? 'bg-amber-100 text-amber-700' : 
                            'bg-red-100 text-red-700'
                          }`}>
                            {cuenta.estado === 'pagado' ? 'Pagado' : cuenta.estado === 'parcial' ? 'Parcial' : 'Pendiente'}
                          </span>
                          {cuenta.estado !== 'pagado' && (
                            <Link 
                              href={`/cuentas/${cuenta.id}`} 
                              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-colors bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 h-7 px-2.5 ml-1"
                              title="Registrar abono"
                            >
                              Registrar abono
                            </Link>
                          )}
                        </div>
                      </div>
                      
                      {/* Mini progress bar for account */}
                      <div className="w-full bg-zinc-100 rounded-full h-1.5 mb-1 overflow-hidden">
                        <div 
                          className={`h-1.5 rounded-full ${cuenta.estado === 'pagado' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(100, (cuenta.abonado / Number(cuenta.valor_total)) * 100)}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                        <span>Abonado: ${cuenta.abonado.toLocaleString('es-CO')}</span>
                        <span>Total: ${Number(cuenta.valor_total).toLocaleString('es-CO')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Historial de Abonos */}
              {todosLosAbonos.length > 0 && (
                <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
                    <h3 className="font-medium text-zinc-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-zinc-500" />
                      Historial de Pagos
                    </h3>
                  </div>
                  <div className="p-0">
                    <div className="divide-y divide-zinc-100">
                      {todosLosAbonos.map((pago) => (
                        <div key={pago.id} className="p-5 hover:bg-zinc-50/50 transition-colors flex items-start gap-4">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 shrink-0 mt-0.5">
                            <CreditCard className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-emerald-600 text-base">+${Number(pago.monto).toLocaleString('es-CO')}</span>
                              <time className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-1 rounded-md">
                                {new Date(pago.fecha_pago).toLocaleDateString('es-CO')}
                              </time>
                            </div>
                            <div className="text-sm text-zinc-900 mb-1.5">
                              Abono a cuenta:{' '}
                              <Link href={`/cuentas/${pago.cuenta_id}`} className="font-medium hover:text-blue-600 hover:underline">
                                {pago.concepto_cuenta}
                              </Link>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                              <span className="capitalize bg-zinc-100 px-2 py-0.5 rounded-md border border-zinc-200">
                                {pago.origen_fondos === 'saldo_a_favor' ? 'Saldo a favor' : pago.metodo_pago}
                              </span>
                              {pago.notas && <span className="truncate flex-1" title={pago.notas}>• {pago.notas}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Historial de Saldo a Favor */}
              {movimientos.length > 0 && (
                <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden mt-6">
                  <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
                    <h3 className="font-medium text-zinc-900 flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-zinc-500" />
                      Historial de Saldo a Favor
                    </h3>
                  </div>
                  <div className="p-0">
                    <div className="divide-y divide-zinc-100">
                      {movimientos.map((mov) => (
                        <div key={mov.id} className="p-5 hover:bg-zinc-50/50 transition-colors flex items-start gap-4">
                          <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 mt-0.5 ${
                            mov.tipo === 'ingreso' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                          }`}>
                            <Wallet className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-bold text-base ${
                                mov.tipo === 'ingreso' ? 'text-emerald-600' : 'text-blue-600'
                              }`}>
                                {mov.tipo === 'ingreso' ? '+' : '-'}${Number(mov.monto).toLocaleString('es-CO')}
                              </span>
                              <time className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-1 rounded-md">
                                {new Date(mov.fecha).toLocaleDateString('es-CO')}
                              </time>
                            </div>
                            <div className="text-sm text-zinc-900 mb-1.5">
                              {mov.tipo === 'ingreso' ? 'Anticipo registrado' : 'Saldo aplicado a cuenta'}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                              <span className="capitalize bg-zinc-100 px-2 py-0.5 rounded-md border border-zinc-200">
                                {mov.tipo === 'aplicacion' ? 'Saldo a favor' : mov.metodo_pago}
                              </span>
                              {mov.notas && <span className="truncate flex-1" title={mov.notas}>• {mov.notas}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
