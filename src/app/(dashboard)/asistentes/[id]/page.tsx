import Link from "next/link"
import {
  ArrowLeft,
  Edit2,
  Calendar,
  FileText,
  CreditCard,
  Clock,
  Wallet,
  HeartHandshake,
} from "lucide-react"
import { notFound } from "next/navigation"
import { AnticipoForm } from "./AnticipoForm"
import { PagarConSaldoButton } from "./PagarConSaldoButton"
import { filtrarPagosValidos, sumarMontos, toSafeNumber } from "@/lib/utils/contable"
import { DonacionForm } from "./DonacionForm"
import { DonacionActionsMenu } from "./DonacionActionsMenu"
import { RegisterCoachSessionForm } from "@/components/coach/RegisterCoachSessionForm"
import { CoachSessionsPdf } from "@/components/coach/CoachSessionsPdf"
import { CoachSessionActions } from "@/components/coach/CoachSessionActions"
import { requireRoles } from "@/lib/utils/authz"
import { estadoPorActividad } from "@/lib/utils/asistentes"

const cardContainer =
  "rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] shadow-sm overflow-hidden"
const cardHeader =
  "flex items-center gap-2 px-5 py-4 bg-[rgb(var(--surface-2))] border-b border-[rgb(var(--border))]"
const cardTitle = "text-sm font-semibold text-[rgb(var(--text-primary))] tracking-wide"
const headerAccent = "w-1 h-5 rounded-full bg-[rgb(var(--accent))]"

export default async function AsistenteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, perfil } = await requireRoles(["admin", "caja"])
  const isAdmin = perfil.rol === "admin"

  const { data: asistente } = await supabase.from("asistentes").select("*").eq("id", id).single()
  if (!asistente) notFound()

  const { data: cuentas } = await supabase
    .from("cuentas_por_cobrar")
    .select(`*, pagos_abonos (*)`)
    .eq("asistente_id", id)
    .order("fecha_emision", { ascending: false })

  const { data: movimientosData, error: movError } = await supabase
    .from("movimientos_saldo_favor")
    .select("*")
    .eq("asistente_id", id)
    .order("fecha", { ascending: false })
  const movimientos = movimientosData || []
  const saldoFavorError = movError
    ? "No se pudo cargar el historial de saldo a favor. Contacta al administrador."
    : null

  let totalIngresosSaldo = 0
  let totalAplicadoSaldo = 0
  movimientos.forEach((m) => {
    if (m.tipo === "ingreso") totalIngresosSaldo += toSafeNumber(m.monto)
    if (m.tipo === "aplicacion") totalAplicadoSaldo += toSafeNumber(m.monto)
  })
  const saldoAFavor = Math.round(totalIngresosSaldo - totalAplicadoSaldo)

  const { data: donacionesData } = await supabase
    .from("donaciones_asistentes")
    .select("*")
    .eq("asistente_id", id)
    .order("fecha", { ascending: false })
  const donaciones = donacionesData || []
  const donacionesActivas = donaciones.filter((d) => d.estado !== "anulado")
  const totalDonado = Math.round(donacionesActivas.reduce((acc, curr) => acc + toSafeNumber(curr.monto), 0))
  const cantidadDonaciones = donaciones.length

  const { data: paquetesCoach } = await supabase
    .from("coach_paquetes")
    .select("id, cuenta_id, sesiones_compradas, coach_sesiones (id, fecha, notas)")
    .eq("asistente_id", id)

  const { data: sesionesCoach } = await supabase
    .from("coach_sesiones")
    .select("id, fecha, notas, paquete_id, asistente_id, coach_paquetes (cuenta_id, sesiones_compradas)")
    .eq("asistente_id", id)
    .order("fecha", { ascending: false })

  const sesionesCompradas =
    paquetesCoach?.reduce((acc: number, p: any) => acc + (toSafeNumber(p.sesiones_compradas) || 0), 0) || 0
  const sesionesRealizadas = (sesionesCoach || []).length
  const sesionesRestantes = Math.max(0, sesionesCompradas - sesionesRealizadas)
  const sesionesLista = (sesionesCoach || []).map((s: any) => ({
    id: s.id,
    fecha: s.fecha,
    notas: s.notas,
    paquete_id: s.paquete_id,
    cuenta_id: s.coach_paquetes?.cuenta_id || null,
  }))
  const paqueteActivo = (paquetesCoach || []).find(
    (p: any) => (sesionesCoach || []).filter((s) => s.paquete_id === p.id).length < toSafeNumber(p.sesiones_compradas)
  )

  const actividad = estadoPorActividad({
    cuentas_por_cobrar: cuentas || [],
    movimientos_saldo_favor: movimientos,
    donaciones_asistentes: donaciones,
    coach_sesiones: sesionesCoach || [],
  })
  const ultimaActividadTexto = actividad.ultima_actividad
    ? new Date(actividad.ultima_actividad).toLocaleDateString("es-CO")
    : "Sin actividad"

  let totalFacturado = 0
  let totalAbonado = 0

  const cuentasProcesadas = (cuentas || []).map((cuenta) => {
    const pagosValidos = filtrarPagosValidos(cuenta.pagos_abonos || [])
    const abonado = Math.round(toSafeNumber(sumarMontos(pagosValidos)))
    const valorCuenta = toSafeNumber(cuenta.valor_total)
    const pendiente = Math.max(0, Math.round(valorCuenta - abonado))

    totalFacturado += valorCuenta
    totalAbonado += abonado

    return { ...cuenta, abonado, pendiente, valorCuenta }
  })

  totalFacturado = Math.round(toSafeNumber(totalFacturado))
  totalAbonado = Math.round(toSafeNumber(totalAbonado))
  const saldoPendiente = Math.max(0, Math.round(toSafeNumber(totalFacturado - totalAbonado)))

  const todosLosAbonos = (cuentas || [])
    .flatMap((cuenta) =>
      (cuenta.pagos_abonos || []).map((pago: any) => ({
        ...pago,
        concepto_cuenta: cuenta.concepto,
        cuenta_id: cuenta.id,
      }))
    )
    .sort((a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())

  const hasMovements =
    cuentasProcesadas.length > 0 || donaciones.length > 0 || movimientos.length > 0 || todosLosAbonos.length > 0

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
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
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  actividad.activo
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
                }`}
              >
                {actividad.activo ? "Activo" : "Inactivo"}
              </span>
            </h1>
            <p className="text-zinc-500 flex items-center gap-2">
              {asistente.codigo && (
                <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-xs text-zinc-600">#{asistente.codigo}</span>
              )}
              {asistente.cedula && <span>CC: {asistente.cedula}</span>}
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Última actividad: {ultimaActividadTexto}</span>
            </p>
          </div>
        </div>
        <Link
          href={`/asistentes/${asistente.id}/editar`}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border border-zinc-200 bg-white hover:bg-zinc-100 hover:text-zinc-900 h-10 px-4 py-2"
        >
          <Edit2 className="w-4 h-4" />
          Editar
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Columna izquierda */}
        <div className="space-y-6 md:col-span-1">
          {saldoFavorError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-4 text-sm">{saldoFavorError}</div>
          )}

          <div className={cardContainer}>
            <div className={cardHeader}>
              <span className={headerAccent} aria-hidden />
              <h3 className={cardTitle}>Información de Contacto</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Correo Electrónico</p>
                <p className="text-sm text-zinc-900">{asistente.correo || "No registrado"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Teléfono</p>
                <p className="text-sm text-zinc-900">{asistente.telefono || "No registrado"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Fecha de registro</p>
                <p className="text-sm text-zinc-900 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  {new Date(asistente.fecha_registro || asistente.creado_en).toLocaleDateString("es-CO")}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Fecha de inicio de proceso</p>
                <p className="text-sm text-zinc-900 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  {asistente.fecha_inicio_proceso
                    ? new Date(asistente.fecha_inicio_proceso).toLocaleDateString("es-CO")
                    : "No registrado"}
                </p>
              </div>
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader}>
              <span className={headerAccent} aria-hidden />
              <h3 className={cardTitle}>Resumen Financiero</h3>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Total Facturado</p>
                <p className="text-xl font-semibold text-zinc-900">
                  ${toSafeNumber(totalFacturado).toLocaleString("es-CO")}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Total Abonado</p>
                <p className="text-xl font-semibold text-emerald-600">
                  ${toSafeNumber(totalAbonado).toLocaleString("es-CO")}
                </p>
              </div>
              <div className="pt-4 border-t border-zinc-100">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Saldo Pendiente</p>
                <p className="text-xl font-semibold text-amber-600">
                  ${toSafeNumber(saldoPendiente).toLocaleString("es-CO")}
                </p>
              </div>
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <span className={headerAccent} aria-hidden />
              <HeartHandshake className="w-4 h-4 text-[rgb(var(--text-muted))]" />
              <h3 className={cardTitle}>Donaciones</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600">Total donado</span>
                <span className="font-semibold text-emerald-700">${toSafeNumber(totalDonado).toLocaleString("es-CO")}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600">Cantidad de donaciones</span>
                <span className="font-medium text-zinc-900">{cantidadDonaciones}</span>
              </div>
              <DonacionForm asistenteId={asistente.id} disabled={!isAdmin} />
              {donaciones.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-[rgb(var(--text-muted))]">Historial de donaciones</p>
                  <div className="space-y-2">
                    {donaciones.map((donacion) => (
                      <div
                        key={donacion.id}
                        className="flex items-center justify-between rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-[rgb(var(--text-primary))]">
                            ${toSafeNumber(donacion.monto).toLocaleString("es-CO")} · {donacion.metodo_pago}
                          </p>
                          <p className="text-[11px] text-[rgb(var(--text-muted))]">
                            {new Date(donacion.fecha).toLocaleDateString("es-CO")}
                            {donacion.notas ? ` · ${donacion.notas}` : ""}
                          </p>
                        </div>
                        <DonacionActionsMenu donacion={donacion} isAdmin={isAdmin} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <span className={headerAccent} aria-hidden />
              <FileText className="w-4 h-4 text-[rgb(var(--text-muted))]" />
              <h3 className={cardTitle}>Documentos</h3>
            </div>
            <div className="p-5 space-y-3 text-sm text-zinc-600">
              <p>No hay documentos cargados.</p>
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <span className={headerAccent} aria-hidden />
              <Wallet className="w-4 h-4 text-[rgb(var(--text-muted))]" />
              <h3 className={cardTitle}>Saldo a Favor</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-zinc-700">Saldo disponible: ${toSafeNumber(saldoAFavor).toLocaleString("es-CO")}</p>
              <AnticipoForm asistenteId={asistente.id} disabled={!isAdmin} />
              {saldoAFavor > 0 && <PagarConSaldoButton asistenteId={asistente.id} disabled={!isAdmin} />}
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <span className={headerAccent} aria-hidden />
              <HeartHandshake className="w-4 h-4 text-[rgb(var(--text-muted))]" />
              <h3 className={cardTitle}>Sesiones guía coach</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600">Compradas</span>
                <span className="font-medium text-zinc-900">{sesionesCompradas}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600">Realizadas</span>
                <span className="font-medium text-zinc-900">{sesionesRealizadas}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600">Restantes</span>
                <span className="font-medium text-zinc-900">{sesionesRestantes}</span>
              </div>
              {paqueteActivo && (
                <div className="pt-2">
                  <RegisterCoachSessionForm paqueteId={paqueteActivo.id} disabled={false} />
                </div>
              )}
              <div className="pt-2">
                <CoachSessionsPdf
                  sesiones={sesionesLista.map((s) => ({ fecha: s.fecha, notas: s.notas }))}
                  asistenteNombre={asistente.nombre}
                  sesionesCompradas={sesionesCompradas}
                  sesionesRealizadas={sesionesRealizadas}
                  sesionesRestantes={sesionesRestantes}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Columna derecha */}
        <div className="md:col-span-2 space-y-6">
          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center justify-between"}>
              <span className={headerAccent} aria-hidden />
              <CreditCard className="w-4 h-4 text-[rgb(var(--text-muted))]" />
              <h3 className={cardTitle}>Cuentas por Cobrar</h3>
              <Link
                href={`/cuentas/nueva?asistente=${asistente.id}&returnTo=/asistentes/${asistente.id}`}
                className="text-xs font-semibold text-[rgb(var(--accent-strong))] bg-[rgba(var(--accent),0.12)] border border-[rgba(var(--accent),0.35)] px-3 py-1.5 rounded-md hover:bg-[rgba(var(--accent),0.2)] transition-colors"
              >
                Crear cuenta de cobro
              </Link>
            </div>
            <div className="p-5 space-y-4">
              {cuentasProcesadas.length ? (
                <div className="h-[520px] overflow-y-auto space-y-4 pr-1">
                  {cuentasProcesadas.map((cuenta) => (
                    <Link
                      key={cuenta.id}
                      href={`/cuentas/${cuenta.id}?backTo=/asistentes/${asistente.id}`}
                      className="block rounded-lg border border-zinc-200 p-4 bg-zinc-50/60 hover:bg-zinc-100/70 hover:border-zinc-300 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-zinc-900">{cuenta.concepto}</p>
                          <p className="text-xs text-zinc-500">
                            Emisión: {new Date(cuenta.fecha_emision).toLocaleDateString("es-CO")}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-zinc-600">
                            Valor: ${toSafeNumber(cuenta.valorCuenta ?? cuenta.valor_total).toLocaleString("es-CO")}
                          </p>
                          <p className="text-emerald-600">Abonado: ${toSafeNumber(cuenta.abonado).toLocaleString("es-CO")}</p>
                          <p className="text-amber-600">
                            Pendiente: ${toSafeNumber(cuenta.pendiente).toLocaleString("es-CO")}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Sin cuentas registradas.</p>
              )}
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <span className={headerAccent} aria-hidden />
              <Clock className="w-4 h-4 text-[rgb(var(--text-muted))]" />
              <h3 className={cardTitle}>Historial de Abonos</h3>
            </div>
            <div className="p-5 space-y-3">
              {todosLosAbonos.length ? (
                <div className="h-[420px] overflow-y-auto space-y-3 pr-1">
                  {todosLosAbonos.map((pago: any) => (
                    <div key={pago.id} className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 bg-white">
                      <div>
                        <p className="font-medium text-zinc-900 text-sm">${toSafeNumber(pago.monto).toLocaleString("es-CO")}</p>
                        <p className="text-xs text-zinc-500">
                          {new Date(pago.fecha_pago).toLocaleDateString("es-CO")} · {pago.concepto_cuenta}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>{pago.metodo_pago || "—"}</span>
                        <span>{pago.notas || "Sin notas"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No hay abonos registrados.</p>
              )}
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <span className={headerAccent} aria-hidden />
              <Wallet className="w-4 h-4 text-[rgb(var(--text-muted))]" />
              <h3 className={cardTitle}>Historial Saldo a Favor</h3>
            </div>
            <div className="p-5 space-y-2">
              {movimientos.length ? (
                <div className="h-[420px] overflow-y-auto space-y-2 pr-1">
                  {movimientos.map((mov) => (
                    <div
                      key={mov.id}
                      className="flex items-center justify-between border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white"
                    >
                      <span>{new Date(mov.fecha).toLocaleDateString("es-CO")}</span>
                      <span className={mov.tipo === "ingreso" ? "text-emerald-600" : "text-amber-600"}>
                        {mov.tipo === "ingreso" ? "+" : "-"}${toSafeNumber(mov.monto).toLocaleString("es-CO")}
                      </span>
                      <span>{mov.metodo_pago}</span>
                      <span className="text-zinc-500 truncate max-w-[180px]">{mov.notas || "Sin notas"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Sin movimientos de saldo a favor.</p>
              )}
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <span className={headerAccent} aria-hidden />
              <HeartHandshake className="w-4 h-4 text-[rgb(var(--text-muted))]" />
              <h3 className={cardTitle}>Historial de Sesiones coach</h3>
            </div>
            <div className="p-5 space-y-2">
              {sesionesLista.length ? (
                <div className="h-[420px] overflow-y-auto space-y-2 pr-1">
                  {sesionesLista.map((s, idx) => (
                    <div
                      key={`${s.paquete_id}-${s.fecha}-${idx}`}
                      className="flex items-center justify-between border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white"
                    >
                      <div className="flex flex-col gap-1">
                        <span>{new Date(s.fecha).toLocaleDateString("es-CO")}</span>
                        <span className="text-zinc-600 truncate max-w-[200px]">{s.notas || "Sin notas"}</span>
                      </div>
                      {isAdmin && s.id && (
                        <CoachSessionActions sesionId={s.id} fecha={s.fecha} notas={s.notas} />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No hay sesiones registradas.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
