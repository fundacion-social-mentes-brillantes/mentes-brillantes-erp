import { requireRoles } from '@/lib/utils/authz'
import { rutaInternaSegura } from '@/lib/utils/rutas'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CreditCard, Wallet, HeartHandshake } from 'lucide-react'
import { AbonoForm } from './AbonoForm'
import { AplicarSaldoForm } from './AplicarSaldoForm'
import { EditValorModal, EditAbonoModal } from './EditModals'
import { DeleteCuentaButton } from './DeleteCuentaButton'
import { RevertAbonoConSaldoButton } from './RevertAbonoConSaldoButton'
import { DeshacerPagoConSaldoButton } from './DeshacerPagoConSaldoButton'
import { calcularSaldoFavorDisponibleRaw, filtrarPagosValidos, sumarMontos } from '@/lib/utils/contable'
import { formatearFechaHora, formatearFechaIso } from '@/lib/utils/fechas'
import { describirAccionAuditoria } from '@/lib/utils/auditoria-texto'
import { RegisterCoachSessionForm } from '@/components/coach/RegisterCoachSessionForm'
import { CoachSessionsPdf } from '@/components/coach/CoachSessionsPdf'
import { CoachSessionActions } from '@/components/coach/CoachSessionActions'
import { pesos } from '@/lib/utils/pesos'
import { metodoPagoLegible, notaLegible } from '@/lib/utils/textos'

export default async function DetalleCuentaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ backTo?: string }>
}) {
  const { id } = await params
  const resolvedSearch = await searchParams
  const backTo = rutaInternaSegura(resolvedSearch?.backTo) ?? '/cuentas'
  const { supabase } = await requireRoles(['admin', 'caja'])

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

  const abonos = cuenta.pagos_abonos?.sort((a, b) => 
    new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime()
  ) || []

  const abonosValidos = filtrarPagosValidos(abonos)

  const valor_total = Number(cuenta.valor_total)
  const total_abonado = sumarMontos(abonosValidos)
  const monto_pendiente = valor_total - total_abonado
  const saldos = { valor_total, total_abonado, monto_pendiente }

  // Saldo a favor de la persona (una cuenta sin persona no tiene de donde sacarlo).
  const asistenteId = cuenta.asistente_id
  const { data: movimientosSaldo } = asistenteId
    ? await supabase.from('movimientos_saldo_favor').select('tipo, monto, notas').eq('asistente_id', asistenteId)
    : { data: [] }

  const saldoAFavor = calcularSaldoFavorDisponibleRaw(movimientosSaldo || [])

  // Abonos cuyo sobrepago genero saldo a favor y aun esta vigente (marca [ABONO:<id>], no anulado).
  const abonosConSaldoActivo = new Set<string>()
  for (const m of movimientosSaldo || []) {
    if (m.tipo !== 'ingreso') continue
    const nota = m.notas || ''
    if (nota.includes('[ANULADO]')) continue
    const match = nota.match(/\[ABONO:([0-9a-fA-F-]+)\]/)
    if (match) abonosConSaldoActivo.add(match[1])
  }

  // Check if admin
  const { data: { user } } = await supabase.auth.getUser()
  let isAdmin = false
  if (user) {
    const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
    isAdmin = perfil?.rol === 'admin'
  }

  // Fetch auditoria
  const abonoIds = abonos.map((a) => a.id)
  const { data: auditoria } = await supabase
    .from('auditoria_financiera')
    .select('*')
    .in('registro_id', [id, ...abonoIds])
    .order('fecha', { ascending: false })

  // Paquete coach (si aplica)
  const { data: paqueteData } = await supabase
    .from('coach_paquetes')
    .select('id, sesiones_compradas, asistente_id, coach_sesiones (id, fecha, notas)')
    .eq('cuenta_id', id)
    .limit(1)

  const paquete = paqueteData?.[0] || null

  const sesionesRealizadas = paquete?.coach_sesiones?.length || 0
  const sesionesRestantes = paquete ? Math.max(0, (paquete.sesiones_compradas || 0) - sesionesRealizadas) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link href={backTo} aria-label="Volver" className="mt-0.5 inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gris transition-colors hover:bg-suave hover:text-tinta">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Detalle de Cuenta</h1>
          <p className="mt-1 text-sm text-gris">Información y pagos de la cuenta por cobrar.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resumen de la Cuenta */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-tinta">{cuenta.concepto}</h2>
                <p className="text-gris text-sm">Asistente: {cuenta.asistentes?.nombre}</p>
              </div>
              <span className={`inline-flex items-center self-start rounded-full px-3 py-1 text-sm font-semibold ${
                cuenta.estado === 'pagado' ? 'bg-verde/12 text-verde' :
                cuenta.estado === 'parcial' ? 'bg-ambar/12 text-ambar' :
                'bg-rojo/12 text-rojo'}`}>
                {cuenta.estado.charAt(0).toUpperCase() + cuenta.estado.slice(1)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4 border-y border-linea">
              <div>
                <p className="text-sm text-gris">Valor Total</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-semibold text-tinta">{pesos(Number(saldos.valor_total))}</p>
                  {isAdmin && <EditValorModal cuentaId={cuenta.id} valorActual={Number(saldos.valor_total)} />}
                </div>
              </div>
              <div>
                <p className="text-sm text-gris">Total Abonado</p>
                <p className="text-xl font-semibold text-verde">{pesos(Number(saldos.total_abonado))}</p>
              </div>
              <div>
                <p className="text-sm text-gris">Saldo Pendiente</p>
                <p className={`text-xl font-semibold ${Number(saldos.monto_pendiente) > 0 ? "text-ambar" : "text-gris"}`}>{pesos(Number(saldos.monto_pendiente))}</p>
              </div>
            </div>
            <div className="mt-4 text-sm text-gris">
              Fecha de emisión: {formatearFechaIso(cuenta.fecha_emision)}
            </div>
          </div>

          {paquete && (
            <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <HeartHandshake className="w-5 h-5 text-gris" />
                  <h3 className="text-lg font-semibold text-tinta">Paquete coach</h3>
                </div>
                <span className="text-xs text-gris">Sesiones registradas solo desde este módulo (no retroactivas)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="rounded-xl bg-suave p-3">
                  <p className="text-sm text-gris">Compradas</p>
                  <p className="text-2xl font-semibold text-tinta">{paquete.sesiones_compradas}</p>
                </div>
                <div className="rounded-xl bg-suave p-3">
                  <p className="text-sm text-gris">Realizadas</p>
                  <p className="text-2xl font-semibold text-tinta">{sesionesRealizadas}</p>
                </div>
                <div className="rounded-xl bg-suave p-3">
                  <p className="text-sm text-gris">Restantes</p>
                  <p className={`text-2xl font-semibold ${sesionesRestantes > 0 ? "text-acento" : "text-gris"}`}>{sesionesRestantes}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl bg-suave p-4">
                  <h4 className="text-sm font-semibold text-tinta mb-2">Registrar sesión</h4>
                  <RegisterCoachSessionForm paqueteId={paquete.id} disabled={sesionesRestantes <= 0} />
                  {sesionesRestantes <= 0 && <p className="text-xs text-rojo mt-2">No quedan sesiones disponibles.</p>}
                </div>
                <div className="rounded-xl bg-suave p-4">
                  <h4 className="text-sm font-semibold text-tinta mb-2">Exportar PDF</h4>
                  <CoachSessionsPdf
                    asistenteNombre={cuenta.asistentes?.nombre || ''}
                    sesionesCompradas={paquete.sesiones_compradas}
                    sesionesRealizadas={sesionesRealizadas}
                    sesionesRestantes={sesionesRestantes}
                    sesiones={(paquete.coach_sesiones || []).map((s) => ({ fecha: s.fecha, notas: s.notas }))}
                  />
                </div>
              </div>
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-tinta mb-2">Historial de sesiones</h4>
                <div className="divide-y divide-linea rounded-xl border border-linea">
                  {paquete.coach_sesiones?.length ? paquete.coach_sesiones
                    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                    .map((s) => (
                      <div key={s.id} className="px-4 py-3 text-sm flex justify-between items-start gap-3">
                        <div className="space-y-1">
                          <span className="block text-tinta">{formatearFechaIso(s.fecha)}</span>
                          <span className="block text-gris truncate max-w-[260px]">{s.notas || 'Sin notas'}</span>
                        </div>
                        {isAdmin && <CoachSessionActions sesionId={s.id} fecha={s.fecha} notas={s.notas} />}
                      </div>
                    )) : (
                    <div className="px-4 py-4 text-sm text-gris">Aún no hay sesiones registradas.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Historial de Abonos */}
            <div className="rounded-2xl border border-linea bg-panel overflow-hidden">
            <div className="px-5 py-4 border-b border-linea">
              <h3 className="font-semibold text-tinta">Historial de Abonos</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="border-b border-linea">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {abonos.map((abono) => {
                    const anulado = abono.estado === 'anulado' || (abono.notas || '').includes('[ANULADO]')
                    return (
                    <tr key={abono.id} className={`hover:bg-suave ${anulado ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 text-tinta">{formatearFechaIso(abono.fecha_pago)}</td>
                      <td className="px-4 py-3 text-gris">
                        {abono.origen_fondos === 'saldo_a_favor' ? 'Saldo a favor' : metodoPagoLegible(abono.metodo_pago)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${anulado ? 'text-gris' : 'text-verde'}`}>
                        <div className="flex items-center justify-end gap-2">
                          <span className={anulado ? 'line-through' : ''}>{pesos(Number(abono.monto))}</span>
                          {/* Un abono anulado ya no se corrige: el servidor lo rechazaria. */}
                          {isAdmin && !anulado && <EditAbonoModal abonoId={abono.id} cuentaId={cuenta.id} valorActual={Number(abono.monto)} />}
                          {isAdmin &&
                            !anulado &&
                            abono.origen_fondos !== 'saldo_a_favor' &&
                            abonosConSaldoActivo.has(abono.id) && (
                              <RevertAbonoConSaldoButton cuentaId={cuenta.id} abonoId={abono.id} />
                            )}
                          {isAdmin && !anulado && abono.origen_fondos === 'saldo_a_favor' && (
                            <DeshacerPagoConSaldoButton cuentaId={cuenta.id} abonoId={abono.id} />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gris text-xs truncate max-w-[180px]" title={notaLegible(abono.notas)}>
                        {notaLegible(abono.notas) || '-'}
                      </td>
                    </tr>
                    )
                  })}
                  {!abonos.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gris">
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
          {isAdmin && (
            <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6">
              <h3 className="font-semibold text-tinta mb-3">Acciones (Admin)</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gris mb-2">Editar valor de la cuenta</p>
                  <EditValorModal cuentaId={cuenta.id} valorActual={Number(saldos.valor_total)} />
                </div>
                <div className="pt-2 border-t border-linea">
                  <p className="text-sm text-gris mb-2">Eliminar cuenta</p>
                  <DeleteCuentaButton cuentaId={cuenta.id} />
                  <p className="text-xs text-gris mt-2">
                    Solo se puede eliminar si no tiene pagos, aplicaciones de saldo a favor ni sesiones coach registradas.
                  </p>
                </div>
              </div>
            </div>
          )}

          {cuenta.estado !== 'pagado' ? (
            <>
              {saldoAFavor > 0 && asistenteId && (
                <div className="rounded-2xl border border-verde/30 bg-verde/8 p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-5 h-5 text-verde" />
                    <h3 className="font-semibold text-tinta">Saldo a Favor Disponible</h3>
                  </div>
                  <p className="mb-4 text-2xl font-semibold text-verde">{pesos(saldoAFavor)}</p>
                  <AplicarSaldoForm 
                    cuentaId={cuenta.id} 
                    asistenteId={asistenteId}
                    maxMonto={Math.min(saldoAFavor, saldos.monto_pendiente)} 
                  />
                </div>
              )}

              <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6 sticky top-6">
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className="w-5 h-5 text-gris" />
                  <h3 className="font-semibold text-tinta">Registrar Abono</h3>
                </div>
                <AbonoForm cuentaId={cuenta.id} maxMonto={saldos.monto_pendiente} />
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-verde/30 bg-verde/8 p-6 text-center">
              <h3 className="font-semibold text-verde mb-2">Cuenta Pagada</h3>
              <p className="text-sm text-tinta">Esta cuenta no tiene saldo pendiente.</p>
            </div>
          )}
        </div>
      </div>

      {isAdmin && auditoria && auditoria.length > 0 && (
        <div className="rounded-2xl border border-linea bg-panel overflow-hidden mt-6">
          <div className="px-5 py-4 border-b border-linea">
            <h3 className="font-semibold text-tinta">Historial de cambios (Admin)</h3>
          </div>
          <div className="divide-y divide-linea">
            {auditoria.map((aud) => {
              const linea = describirAccionAuditoria(aud.accion)
              return (
                <div key={aud.id} className="p-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 mb-1">
                    <span className="font-medium text-tinta">{linea.titulo}</span>
                    <span className="text-gris">{formatearFechaHora(aud.fecha)}</span>
                  </div>
                  <div className="text-gris mb-1">
                    {linea.tipo === 'nuevo' && (
                      <>Valor: <span className="text-verde font-medium">{pesos(Number(aud.valor_nuevo))}</span></>
                    )}
                    {linea.tipo === 'baja' && (
                      <>Valor: <span className="line-through text-rojo">{pesos(Number(aud.valor_anterior))}</span></>
                    )}
                    {linea.tipo === 'cambio' && (
                      <>
                        Antes <span className="line-through text-rojo">{pesos(Number(aud.valor_anterior))}</span>
                        {' → '}ahora <span className="text-verde font-medium">{pesos(Number(aud.valor_nuevo))}</span>
                      </>
                    )}
                  </div>
                  {aud.motivo && <div className="text-gris italic">Motivo: {notaLegible(aud.motivo)}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
