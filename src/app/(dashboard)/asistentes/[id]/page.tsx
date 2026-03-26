import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Edit2, Calendar, FileText, CreditCard, CheckCircle2, Clock, AlertCircle, Plus, Wallet, HeartHandshake } from 'lucide-react'
import { notFound } from 'next/navigation'
import { AnticipoForm } from './AnticipoForm'
import { PagarConSaldoButton } from './PagarConSaldoButton'
import { filtrarPagosValidos, sumarMontos } from '@/lib/utils/contable'
import { DonacionForm } from './DonacionForm'
import { DonacionActionsMenu } from './DonacionActionsMenu'
import { RegisterCoachSessionForm } from '@/components/coach/RegisterCoachSessionForm'
import { CoachSessionsPdf } from '@/components/coach/CoachSessionsPdf'

export default async function AsistenteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient()
  
  if (!supabase) return null

  // Perfil de usuario y rol
  const { data: userData } = await supabase.auth.getUser()
  let userRole: string | null = null
  if (userData?.user) {
    const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', userData.user.id).single()
    userRole = perfil?.rol || null
  }
  const isAdmin = userRole === 'admin'

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

  let movimientosSaldo: any[] | null = null
  let saldoFavorError: string | null = null

  // Fetch movimientos de saldo a favor
  const { data: movimientosData, error: movError } = await supabase
    .from('movimientos_saldo_favor')
    .select('*')
    .eq('asistente_id', id)
    .order('fecha', { ascending: false })

  if (movError) {
    console.error('Error cargando movimientos_saldo_favor:', movError)
    saldoFavorError = 'No se pudo cargar el historial de saldo a favor. Contacta al administrador.'
  } else {
    movimientosSaldo = movimientosData
  }

  let totalIngresosSaldo = 0
  let totalAplicadoSaldo = 0
  
  const movimientos = movimientosSaldo || []
  movimientos.forEach(m => {
    if (m.tipo === 'ingreso') totalIngresosSaldo += Number(m.monto)
    if (m.tipo === 'aplicacion') totalAplicadoSaldo += Number(m.monto)
  })
  const saldoAFavor = Math.round(totalIngresosSaldo - totalAplicadoSaldo)

  // Donaciones
  const { data: donacionesData } = await supabase
    .from('donaciones_asistentes')
    .select('*')
    .eq('asistente_id', id)
    .order('fecha', { ascending: false })

  const donaciones = donacionesData || []
  const donacionesActivas = donaciones.filter(d => d.estado !== 'anulado')
  const totalDonado = Math.round(donacionesActivas.reduce((acc, curr) => acc + Number(curr.monto), 0))
  const cantidadDonaciones = donaciones.length

  // Paquetes coach y sesiones (solo módulo nuevo)
  const { data: paquetesCoach } = await supabase
    .from('coach_paquetes')
    .select('id, cuenta_id, sesiones_compradas, coach_sesiones (id, fecha, notas)')
    .eq('asistente_id', id)

  const { data: sesionesCoach } = await supabase
    .from('coach_sesiones')
    .select('id, fecha, notas, paquete_id, asistente_id, coach_paquetes (cuenta_id, sesiones_compradas)')
    .eq('asistente_id', id)
    .order('fecha', { ascending: false })

  const sesionesCompradas = paquetesCoach?.reduce((acc: number, p: any) => acc + (p.sesiones_compradas || 0), 0) || 0
  const sesionesRealizadas = (sesionesCoach || []).length
  const sesionesRestantes = Math.max(0, sesionesCompradas - sesionesRealizadas)
  const sesionesLista = (sesionesCoach || []).map((s: any) => ({
    fecha: s.fecha,
    notas: s.notas,
    paquete_id: s.paquete_id,
    cuenta_id: s.coach_paquetes?.cuenta_id || null
  }))
  const paqueteActivo = (paquetesCoach || []).find((p: any) => (sesionesCoach || []).filter((s) => s.paquete_id === p.id).length < (p.sesiones_compradas || 0))

  // Calculate totals
  let totalFacturado = 0
  let totalAbonado = 0

  const cuentasProcesadas = (cuentas || []).map(cuenta => {
    const pagosValidos = filtrarPagosValidos(cuenta.pagos_abonos || [])
    const abonado = Math.round(sumarMontos(pagosValidos))
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

  // Extract all payments for the timeline
  const todosLosAbonos = (cuentas || []).flatMap(cuenta => 
    (cuenta.pagos_abonos || []).map((pago: any) => ({
      ...pago,
      concepto_cuenta: cuenta.concepto,
      cuenta_id: cuenta.id
    }))
  ).sort((a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())

  const hasMovements = (cuentasProcesadas.length > 0) || (donaciones.length > 0) || (movimientos.length > 0) || (todosLosAbonos.length > 0)

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
          {saldoFavorError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-4 text-sm">
              {saldoFavorError}
            </div>
          )}

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
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] shadow-soft overflow-hidden">
            <div className="px-5 py-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-3))] flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[rgb(var(--accent))]" />
              <h3 className="font-medium text-[rgb(var(--text-primary))]">Saldo a Favor</h3>
            </div>
            <div className="p-5">
              <p className="text-3xl font-bold text-[rgb(var(--text-primary))] mb-6">
                ${saldoAFavor.toLocaleString('es-CO')}
              </p>
              
              {saldoAFavor > 0 && saldoPendiente > 0 && (
                <div className="mb-6 -mt-2">
                  <PagarConSaldoButton asistenteId={asistente.id} disabled={false} />
                </div>
              )}

              <div className="pt-4 border-t border-[rgb(var(--border))]">
                <h4 className="text-sm font-medium text-[rgb(var(--text-primary))] mb-3">Registrar Anticipo</h4>
                <AnticipoForm asistenteId={asistente.id} />
              </div>
            </div>
          </div>

          {/* Donaciones Card */}
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] shadow-soft overflow-hidden">
            <div className="px-5 py-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-3))] flex items-center gap-2">
              <HeartHandshake className="w-4 h-4 text-[rgb(var(--accent))]" />
              <h3 className="font-medium text-[rgb(var(--text-primary))]">Donaciones</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-medium text-[rgb(var(--text-muted))] uppercase tracking-wider mb-1">Total Donado</p>
                  <p className="text-2xl font-bold text-[rgb(var(--text-primary))]">${totalDonado.toLocaleString('es-CO')}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-[rgb(var(--text-muted))] uppercase tracking-wider mb-1">Donaciones</p>
                  <p className="text-lg font-semibold text-[rgb(var(--text-primary))]">{cantidadDonaciones}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-[rgb(var(--border))]">
                <h4 className="text-sm font-semibold text-[rgb(var(--text-primary))] mb-2">Registrar Donación</h4>
                <DonacionForm asistenteId={asistente.id} />
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
                Este asistente aún no tiene cuentas por cobrar, donaciones ni abonos registrados en el sistema.
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
                <div className="divide-y divide-zinc-100 max-h-80 overflow-y-auto">
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
                              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-colors h-7 px-2.5 ml-1 border border-[rgba(var(--success),0.35)] bg-[rgba(var(--success),0.12)] text-[rgb(var(--success))] hover:bg-[rgba(var(--success),0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent),0.35)]"
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

              {/* Donaciones */}
              <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] shadow-soft overflow-hidden">
                <div className="px-5 py-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-3))] flex items-center justify-between">
                  <h3 className="font-medium text-[rgb(var(--text-primary))] flex items-center gap-2">
                    <HeartHandshake className="w-4 h-4 text-[rgb(var(--accent))]" />
                    Donaciones del Asistente
                  </h3>
                </div>
                <div className="divide-y divide-[rgb(var(--border))]">
                  {donaciones.length === 0 ? (
                    <div className="p-6 text-sm text-[rgb(var(--text-muted))] bg-[rgb(var(--surface-2))] text-center">No hay donaciones registradas.</div>
                  ) : donaciones.map((dona) => (
                    <div
                      key={dona.id}
                      className="p-5 hover:bg-[rgb(var(--surface-3))] transition-colors flex flex-col gap-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold text-[rgb(var(--accent))]">+${Number(dona.monto).toLocaleString('es-CO')}</span>
                          <span className="text-xs px-2 py-1 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-3))] text-[rgb(var(--text-primary))] capitalize">
                            {dona.metodo_pago?.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[rgb(var(--text-muted))] bg-[rgb(var(--surface-2))] px-2 py-1 rounded-md border border-[rgb(var(--border))]">
                            {new Date(dona.fecha).toLocaleDateString('es-CO')}
                          </span>
                          {isAdmin && <DonacionActionsMenu donacion={dona} />}
                        </div>
                      </div>
                      <div className="flex items-start justify-between text-xs text-[rgb(var(--text-muted))] gap-3">
                        <span className={`font-medium ${dona.estado === 'anulado' ? 'text-[rgb(var(--danger))]' : 'text-[rgb(var(--accent))]'}`}>
                          {dona.estado === 'anulado' ? 'Anulado' : 'Activo'}
                        </span>
                        {dona.notas && <span className="truncate max-w-[260px] text-[rgb(var(--text-primary))]" title={dona.notas}>{dona.notas}</span>}
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
                    <div className="divide-y divide-zinc-100 max-h-80 overflow-y-auto">
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
                <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] shadow-soft overflow-hidden mt-6">
                  <div className="px-5 py-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-3))]">
                    <h3 className="font-medium text-[rgb(var(--text-primary))] flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-[rgb(var(--accent))]" />
                      Historial de Saldo a Favor
                    </h3>
                  </div>
                  <div className="p-0">
                    <div className="divide-y divide-[rgb(var(--border))] max-h-72 overflow-y-auto">
                      {movimientos.map((mov) => (
                        <div key={mov.id} className="p-5 hover:bg-[rgb(var(--surface-3))] transition-colors flex items-start gap-4">
                          <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 mt-0.5 border border-[rgb(var(--border))] ${
                            mov.tipo === 'ingreso'
                              ? 'bg-[rgba(var(--accent),0.12)] text-[rgb(var(--accent))]'
                              : 'bg-[rgba(var(--info),0.12)] text-[rgb(var(--text-primary))]'
                          }`}>
                            <Wallet className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-bold text-base ${
                                mov.tipo === 'ingreso' ? 'text-[rgb(var(--accent))]' : 'text-[rgb(var(--text-primary))]'
                              }`}>
                                {mov.tipo === 'ingreso' ? '+' : '-'}${Number(mov.monto).toLocaleString('es-CO')}
                              </span>
                              <time className="text-xs font-medium text-[rgb(var(--text-muted))] bg-[rgb(var(--surface-2))] px-2 py-1 rounded-md border border-[rgb(var(--border))]">
                                {new Date(mov.fecha).toLocaleDateString('es-CO')}
                              </time>
                            </div>
                            <div className="text-sm text-[rgb(var(--text-primary))] mb-1.5">
                              {mov.tipo === 'ingreso' ? 'Anticipo registrado' : 'Saldo aplicado a cuenta'}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--text-muted))]">
                              <span className="capitalize bg-[rgb(var(--surface-2))] px-2 py-0.5 rounded-md border border-[rgb(var(--border))]">
                                {mov.tipo === 'aplicacion' ? 'Saldo a favor' : mov.metodo_pago}
                              </span>
                              {mov.notas && <span className="truncate flex-1 text-[rgb(var(--text-primary))]" title={mov.notas}>• {mov.notas}</span>}
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

    {/* Sesiones guía coach - sección ancha */}
    <div className="space-y-4 mt-10">
      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] shadow-soft overflow-hidden">
        <div className="px-6 py-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-3))] flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-medium text-[rgb(var(--text-primary))]">Sesiones guía coach</h3>
            <p className="text-xs text-[rgb(var(--text-muted))]">Conteo solo para sesiones registradas desde este módulo (no retroactivo).</p>
          </div>
          {paqueteActivo && (
            <span className="text-[10px] px-2 py-1 rounded-full bg-[rgba(var(--info),0.12)] text-[rgb(var(--info))] border border-[rgba(var(--info),0.25)]">
              Activo
            </span>
          )}
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-3))] p-3">
              <p className="text-xs text-[rgb(var(--text-muted))]">Compradas</p>
              <p className="text-2xl font-bold text-[rgb(var(--text-primary))]">{sesionesCompradas}</p>
            </div>
            <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-3))] p-3">
              <p className="text-xs text-[rgb(var(--text-muted))]">Realizadas</p>
              <p className="text-2xl font-bold text-[rgb(var(--accent))]">{sesionesRealizadas}</p>
            </div>
            <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-3))] p-3">
              <p className="text-xs text-[rgb(var(--text-muted))]">Restantes</p>
              <p className="text-2xl font-bold text-[rgb(var(--danger))]">{sesionesRestantes}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-4 space-y-4">
              <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-3))] p-4 space-y-3">
                <h4 className="text-sm font-semibold text-[rgb(var(--text-primary))]">Registrar sesión</h4>
                {paqueteActivo ? (
                  <RegisterCoachSessionForm paqueteId={paqueteActivo.id} disabled={false} />
                ) : (
                  <p className="text-sm text-[rgb(var(--text-muted))]">
                    No hay paquetes coach con sesiones pendientes.
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-3))] p-4 space-y-3">
                <h4 className="text-sm font-semibold text-[rgb(var(--text-primary))]">Exportar PDF</h4>
                <CoachSessionsPdf
                  asistenteNombre={asistente.nombre}
                  sesionesCompradas={sesionesCompradas}
                  sesionesRealizadas={sesionesRealizadas}
                  sesionesRestantes={sesionesRestantes}
                  sesiones={sesionesLista.map((s) => ({ fecha: s.fecha, notas: s.notas || '' }))}
                />
              </div>
            </div>

            <div className="lg:col-span-8 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-3))] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h4 className="text-sm font-semibold text-[rgb(var(--text-primary))]">Historial de sesiones coach</h4>
                  <p className="text-xs text-[rgb(var(--text-muted))]">Sesiones registradas desde este módulo.</p>
                </div>
              </div>
              <div className="divide-y divide-[rgb(var(--border))] border border-[rgb(var(--border))] rounded-md max-h-80 overflow-y-auto">
                {sesionesLista.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-[rgb(var(--text-muted))]">Aún no hay sesiones registradas.</div>
                ) : (
                  sesionesLista.map((s: any, idx: number) => (
                    <div key={`${s.paquete_id}-${idx}-${s.fecha}`} className="px-4 py-3 text-sm flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <span className="block text-[rgb(var(--text-primary))]">{new Date(s.fecha).toLocaleDateString('es-CO')}</span>
                        <span className="block text-[rgb(var(--text-muted))]">{s.notas || 'Sin notas'}</span>
                      </div>
                      <div className="text-right text-[rgb(var(--text-muted))] text-xs shrink-0">
                        {s.cuenta_id ? <Link href={`/cuentas/${s.cuenta_id}`} className="text-[rgb(var(--info))] hover:underline">Ver cuenta</Link> : 'Sin cuenta'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  )
}


