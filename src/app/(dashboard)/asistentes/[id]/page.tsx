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
import { formatearFechaHora, formatearFechaIso, fechaLocalISO } from "@/lib/utils/fechas"
import { createAdminClient } from "@/lib/supabase/admin"
import { estadoEnlace, urlEnlace } from "@/lib/enlaces-personales/enlaces"
import { secretoEnlaces } from "@/lib/enlaces-personales/token"
import { primerNombre, telefonoWhatsApp } from "@/lib/enlaces-personales/proceso"
import { EnlacePersonalCard } from "./EnlacePersonalCard"
import { AnticipoForm } from "./AnticipoForm"
import { PagarConSaldoButton } from "./PagarConSaldoButton"
import { calcularSaldoFavorDisponible, esAnuladoCompleto, filtrarPagosValidos, sumarMontos, toSafeNumber } from "@/lib/utils/contable"
import { DonacionForm } from "./DonacionForm"
import { DonacionActionsMenu } from "./DonacionActionsMenu"
import { RevertAnticipoButton } from "./RevertAnticipoButton"
import { RegisterCoachSessionForm } from "@/components/coach/RegisterCoachSessionForm"
import { CoachSessionsPdf } from "@/components/coach/CoachSessionsPdf"
import { CoachSessionActions } from "@/components/coach/CoachSessionActions"
import { requireRoles } from "@/lib/utils/authz"
import { estadoPorActividad } from "@/lib/utils/asistentes"
import { paqueteDestino, resumenCoach } from "@/lib/utils/coach"
import { pesos } from "@/lib/utils/pesos"
import { metodoPagoLegible, notaLegible } from "@/lib/utils/textos"

const cardContainer =
  "rounded-2xl border border-linea bg-panel overflow-hidden"
const cardHeader =
  "flex items-center gap-2 px-5 py-4 border-b border-linea [&>svg]:text-gris"
const cardTitle = "text-base font-semibold text-tinta"

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

  const saldoAFavor = calcularSaldoFavorDisponible(movimientos)

  const { data: donacionesData } = await supabase
    .from("donaciones_asistentes")
    .select("*")
    .eq("asistente_id", id)
    .order("fecha", { ascending: false })
  const donaciones = donacionesData || []
  const donacionesActivas = donaciones.filter((d) => !esAnuladoCompleto(d))
  const totalDonado = Math.round(donacionesActivas.reduce((acc, curr) => acc + toSafeNumber(curr.monto), 0))
  // Las anuladas no suman al total, asi que tampoco al conteo.
  const cantidadDonaciones = donacionesActivas.length

  const { data: paquetesCoach } = await supabase
    .from("coach_paquetes")
    .select(
      "id, cuenta_id, sesiones_compradas, creado_en, coach_sesiones (id, fecha, notas), cuentas_por_cobrar (concepto, valor_total, fecha_emision)"
    )
    .eq("asistente_id", id)
    .order("creado_en", { ascending: true })

  const { data: sesionesCoach } = await supabase
    .from("coach_sesiones")
    .select("id, fecha, notas, paquete_id, asistente_id, coach_paquetes (cuenta_id, sesiones_compradas)")
    .eq("asistente_id", id)
    .order("fecha", { ascending: false })

  // Misma regla de conteo que /sesiones-coach (helper compartido resumenCoach).
  const { compradas: sesionesCompradas, realizadas: sesionesRealizadas, restantes: sesionesRestantes } =
    resumenCoach(paquetesCoach || [])
  const sesionesLista = (sesionesCoach || []).map((s) => ({
    id: s.id,
    fecha: s.fecha,
    notas: s.notas,
    paquete_id: s.paquete_id,
    cuenta_id: s.coach_paquetes?.cuenta_id || null,
  }))
  // La MISMA regla que usan /sesiones-coach, el bot y la agenda: se gasta primero
  // el credito mas antiguo. Antes aqui era un .find() sobre una consulta sin
  // orden, asi que la sesion podia caer en un paquete distinto segun la pantalla.
  const paqueteActivo = paqueteDestino(paquetesCoach || [])

  // Cada compra por separado, de la mas nueva a la mas vieja, con sus sesiones.
  const comprasCoach = [...(paquetesCoach || [])]
    .map((p) => {
      const cuenta = Array.isArray(p.cuentas_por_cobrar) ? p.cuentas_por_cobrar[0] : p.cuentas_por_cobrar
      const usadas = (p.coach_sesiones || []).length
      const compradasPaq = toSafeNumber(p.sesiones_compradas)
      return {
        id: p.id,
        cuentaId: p.cuenta_id as string | null,
        concepto: cuenta?.concepto ?? null,
        compradoEl: cuenta?.fecha_emision ?? null,
        valorTotal: toSafeNumber(cuenta?.valor_total),
        compradas: compradasPaq,
        usadas,
        restantes: Math.max(0, compradasPaq - usadas),
        sesiones: [...(p.coach_sesiones || [])].sort((a, b) =>
          a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0
        ),
      }
    })
    .sort((a, b) => {
      const fa = a.compradoEl || ""
      const fb = b.compradoEl || ""
      return fa < fb ? 1 : fa > fb ? -1 : 0
    })

  const actividad = estadoPorActividad({
    fecha_registro: asistente.fecha_registro,
    fecha_inicio_proceso: asistente.fecha_inicio_proceso,
    cuentas_por_cobrar: cuentas || [],
    movimientos_saldo_favor: movimientos,
    donaciones_asistentes: donaciones,
    coach_sesiones: sesionesCoach || [],
  })
  const ultimaActividadTexto = actividad.ultima_actividad
    ? // Viene de fechas 'AAAA-MM-DD' (medianoche UTC): se muestra en UTC para no correr un dia.
      actividad.ultima_actividad.toLocaleDateString("es-CO", { timeZone: "UTC" })
    : "Sin actividad"

  const cuentasProcesadas = (cuentas || []).map((cuenta) => {
    const pagosValidos = filtrarPagosValidos(cuenta.pagos_abonos || [])
    const abonado = Math.round(toSafeNumber(sumarMontos(pagosValidos)))
    const valorCuenta = toSafeNumber(cuenta.valor_total)
    const pendiente = Math.max(0, Math.round(valorCuenta - abonado))
    return { ...cuenta, abonado, pendiente, valorCuenta }
  })

  const totalFacturado = Math.round(toSafeNumber(cuentasProcesadas.reduce((acc, c) => acc + c.valorCuenta, 0)))
  const totalAbonado = Math.round(toSafeNumber(cuentasProcesadas.reduce((acc, c) => acc + c.abonado, 0)))
  const saldoPendiente = Math.max(0, Math.round(toSafeNumber(totalFacturado - totalAbonado)))

  // Enlace personal "Mi proceso": la tabla solo la lee el servidor (service role).
  const secretoEnlace = secretoEnlaces()
  const clienteEnlaces = createAdminClient()
  const enlace =
    secretoEnlace && clienteEnlaces ? await estadoEnlace(clienteEnlaces, id).catch(() => null) : null
  const urlEnlacePersonal = enlace?.activo && secretoEnlace ? urlEnlace(id, enlace.version, secretoEnlace) : null

  const todosLosAbonos = (cuentas || [])
    .flatMap((cuenta) =>
      (cuenta.pagos_abonos || []).map((pago) => ({
        ...pago,
        concepto_cuenta: cuenta.concepto,
        cuenta_id: cuenta.id,
      }))
    )
    .sort((a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/asistentes"
            aria-label="Volver a asistentes"
            className="mt-0.5 inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gris transition-colors hover:bg-suave hover:text-tinta"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">
              {asistente.nombre}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  actividad.activo ? "bg-verde/12 text-verde" : "bg-suave-2 text-gris"
                }`}
              >
                {actividad.activo ? "Activo" : "Inactivo"}
              </span>
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gris">
              {asistente.codigo && <span>Código {asistente.codigo}</span>}
              {asistente.cedula && <span>CC {asistente.cedula}</span>}
              <span>Última actividad: {ultimaActividadTexto}</span>
            </p>
          </div>
        </div>
        <Link
          href={`/asistentes/${asistente.id}/editar`}
          className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-linea bg-panel px-4 text-sm font-semibold text-tinta transition-colors hover:border-linea-fuerte hover:bg-suave"
        >
          <Edit2 className="w-4 h-4" />
          Editar
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Columna izquierda */}
        <div className="space-y-6 md:col-span-1">
          {saldoFavorError && (
            <div className="rounded-xl border border-ambar/30 bg-ambar/10 text-ambar p-4 text-sm">{saldoFavorError}</div>
          )}

          <div className={cardContainer}>
            <div className={cardHeader}>
              <h3 className={cardTitle}>Información de Contacto</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm text-gris mb-0.5">Correo Electrónico</p>
                <p className="text-sm text-tinta">{asistente.correo || "No registrado"}</p>
              </div>
              <div>
                <p className="text-sm text-gris mb-0.5">Teléfono</p>
                <p className="text-sm text-tinta">{asistente.telefono || "No registrado"}</p>
              </div>
              <div>
                <p className="text-sm text-gris mb-0.5">Fecha de registro</p>
                <p className="text-sm text-tinta flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gris" />
                  {asistente.fecha_registro
                    ? formatearFechaIso(asistente.fecha_registro)
                    : asistente.creado_en
                      ? formatearFechaIso(fechaLocalISO(new Date(asistente.creado_en)))
                      : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gris mb-0.5">Fecha de inicio de proceso</p>
                <p className="text-sm text-tinta flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gris" />
                  {asistente.fecha_inicio_proceso
                    ? formatearFechaIso(asistente.fecha_inicio_proceso)
                    : "No registrado"}
                </p>
              </div>
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader}>
              <h3 className={cardTitle}>Enlace personal</h3>
            </div>
            <div className="p-5">
              <EnlacePersonalCard
                asistenteId={asistente.id}
                primerNombre={primerNombre(asistente.nombre)}
                whatsappPersona={telefonoWhatsApp(asistente.telefono)}
                url={urlEnlacePersonal}
                ultimoAcceso={enlace?.activo ? formatearFechaHora(enlace.ultimoAcceso) || null : null}
                configurado={Boolean(secretoEnlace && clienteEnlaces)}
              />
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader}>
              <h3 className={cardTitle}>Resumen Financiero</h3>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <p className="text-sm text-gris mb-0.5">Total Facturado</p>
                <p className="text-xl font-semibold text-tinta">
                  {pesos(toSafeNumber(totalFacturado))}
                </p>
              </div>
              <div>
                <p className="text-sm text-gris mb-0.5">Total Abonado</p>
                <p className="text-xl font-semibold text-verde">
                  {pesos(toSafeNumber(totalAbonado))}
                </p>
              </div>
              <div className="pt-4 border-t border-linea">
                <p className="text-sm text-gris mb-0.5">Saldo Pendiente</p>
                <p className="text-xl font-semibold text-ambar">
                  {pesos(toSafeNumber(saldoPendiente))}
                </p>
              </div>
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <HeartHandshake className="w-4 h-4 text-gris" />
              <h3 className={cardTitle}>Donaciones</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gris">Total donado</span>
                <span className="font-semibold text-verde">{pesos(toSafeNumber(totalDonado))}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gris">Cantidad de donaciones</span>
                <span className="font-medium text-tinta">{cantidadDonaciones}</span>
              </div>
              <DonacionForm asistenteId={asistente.id} disabled={!isAdmin} />
              {donaciones.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gris">Historial de donaciones</p>
                  <div className="space-y-2">
                    {donaciones.map((donacion) => (
                      <div
                        key={donacion.id}
                        className="flex items-center justify-between py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium text-tinta">
                            {pesos(toSafeNumber(donacion.monto))} · {metodoPagoLegible(donacion.metodo_pago)}
                          </p>
                          <p className="text-xs text-gris">
                            {formatearFechaIso(donacion.fecha)}
                            {notaLegible(donacion.notas) ? ` · ${notaLegible(donacion.notas)}` : ""}
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
              <FileText className="w-4 h-4 text-gris" />
              <h3 className={cardTitle}>Documentos</h3>
            </div>
            <div className="p-5 space-y-3 text-sm text-gris">
              <p>No hay documentos cargados.</p>
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <Wallet className="w-4 h-4 text-gris" />
              <h3 className={cardTitle}>Saldo a Favor</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-tinta">Saldo disponible: {pesos(toSafeNumber(saldoAFavor))}</p>
              <AnticipoForm asistenteId={asistente.id} disabled={!isAdmin} />
              {saldoAFavor > 0 && <PagarConSaldoButton asistenteId={asistente.id} disabled={!isAdmin} />}
              <p className="text-xs text-gris">
                Los anticipos se revierten desde este perfil, no desde Historial General.
              </p>
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <HeartHandshake className="w-4 h-4 text-gris" />
              <h3 className={cardTitle}>Sesiones guía coach</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gris">Compradas</span>
                <span className="font-medium text-tinta">{sesionesCompradas}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gris">Realizadas</span>
                <span className="font-medium text-tinta">{sesionesRealizadas}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gris">Restantes</span>
                <span className="font-medium text-tinta">{sesionesRestantes}</span>
              </div>

              {/* El total de arriba suma todas las compras. Aquí se ven una por
                  una, que es lo que hace falta para no leerlas revueltas. */}
              {comprasCoach.length > 0 && (
                <div className="pt-3 border-t border-linea space-y-2">
                  <p className="text-xs font-semibold text-gris">
                    Paquetes comprados ({comprasCoach.length})
                  </p>
                  {comprasCoach.map((compra, i) => (
                    <div key={compra.id} className="rounded-xl bg-suave px-3 py-2">
                      <p className="text-xs font-medium text-tinta">
                        {compra.cuentaId ? (
                          <Link href={`/cuentas/${compra.cuentaId}`} className="hover:underline">
                            {compra.concepto || "Paquete coach"}
                          </Link>
                        ) : (
                          compra.concepto || "Paquete coach"
                        )}
                        {i === 0 && comprasCoach.length > 1 && (
                          <span className="ml-2 text-xs font-bold text-verde">el último</span>
                        )}
                      </p>
                      <p className="text-xs text-gris">
                        Comprado el {formatearFechaIso(compra.compradoEl)} · {compra.usadas} de {compra.compradas} tomadas ·{" "}
                        {compra.restantes} {compra.restantes === 1 ? "queda" : "quedan"}
                      </p>
                      {compra.sesiones.length > 0 && (
                        <p className="mt-1 text-xs text-gris">
                          {compra.sesiones.map((s) => formatearFechaIso(s.fecha)).join(" · ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

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
            <div className={cardHeader + " justify-between"}>
              <div className="flex items-center gap-2 [&>svg]:text-gris">
                <CreditCard className="w-4 h-4" />
                <h3 className={cardTitle}>Cuentas por Cobrar</h3>
              </div>
              <Link
                href={`/cuentas/nueva?asistente=${asistente.id}&returnTo=/asistentes/${asistente.id}`}
                className="inline-flex h-9 items-center rounded-xl bg-acento/10 px-3 text-sm font-semibold text-acento transition-colors hover:bg-acento/15"
              >
                Crear cuenta de cobro
              </Link>
            </div>
            <div className="p-5 space-y-4">
              {cuentasProcesadas.length ? (
                <div className="max-h-[520px] overflow-y-auto divide-y divide-linea -my-2">
                  {cuentasProcesadas.map((cuenta) => (
                    <Link
                      key={cuenta.id}
                      href={`/cuentas/${cuenta.id}?backTo=/asistentes/${asistente.id}`}
                      className="-mx-2 block rounded-xl px-2 py-3 transition-colors hover:bg-suave"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-tinta">{cuenta.concepto}</p>
                          <p className="text-xs text-gris">
                            Emisión: {formatearFechaIso(cuenta.fecha_emision)}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-gris">
                            Valor: {pesos(toSafeNumber(cuenta.valorCuenta ?? cuenta.valor_total))}
                          </p>
                          <p className="text-verde">Abonado: {pesos(toSafeNumber(cuenta.abonado))}</p>
                          <p className="text-ambar">
                            Pendiente: {pesos(toSafeNumber(cuenta.pendiente))}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gris">Sin cuentas registradas.</p>
              )}
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <Clock className="w-4 h-4 text-gris" />
              <h3 className={cardTitle}>Historial de Abonos</h3>
            </div>
            <div className="p-5 space-y-3">
              {todosLosAbonos.length ? (
                <div className="max-h-[420px] overflow-y-auto divide-y divide-linea -my-2">
                  {todosLosAbonos.map((pago) => (
                    <div key={pago.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium text-tinta text-sm">{pesos(toSafeNumber(pago.monto))}</p>
                        <p className="text-xs text-gris">
                          {formatearFechaIso(pago.fecha_pago)} · {pago.concepto_cuenta}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gris">
                        <span>{metodoPagoLegible(pago.metodo_pago)}</span>
                        <span>{notaLegible(pago.notas) || "Sin notas"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gris">No hay abonos registrados.</p>
              )}
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <Wallet className="w-4 h-4 text-gris" />
              <h3 className={cardTitle}>Historial Saldo a Favor</h3>
            </div>
            <div className="p-5 space-y-2">
              {movimientos.length ? (
                <div className="max-h-[420px] overflow-y-auto divide-y divide-linea -my-2">
                  {movimientos.map((mov) => (
                    <div
                      key={mov.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <span>{formatearFechaIso(mov.fecha)}</span>
                      <span className={mov.tipo === "ingreso" ? "text-verde" : "text-ambar"}>
                        {mov.tipo === "ingreso" ? "+" : "-"}{pesos(toSafeNumber(mov.monto))}
                      </span>
                      <span>{metodoPagoLegible(mov.metodo_pago)}</span>
                      <span className="text-gris truncate max-w-[180px]" title={notaLegible(mov.notas)}>{notaLegible(mov.notas) || "Sin notas"}</span>
                      {isAdmin && mov.tipo === "ingreso" && !(mov.notas || "").includes("[ANULADO]") && (
                        <RevertAnticipoButton asistenteId={asistente.id} anticipoId={mov.id} />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gris">Sin movimientos de saldo a favor.</p>
              )}
            </div>
          </div>

          <div className={cardContainer}>
            <div className={cardHeader + " flex items-center"}>
              <HeartHandshake className="w-4 h-4 text-gris" />
              <h3 className={cardTitle}>Historial de Sesiones coach</h3>
            </div>
            <div className="p-5 space-y-2">
              {sesionesLista.length ? (
                <div className="max-h-[420px] overflow-y-auto divide-y divide-linea -my-2">
                  {sesionesLista.map((s, idx) => (
                    <div
                      key={`${s.paquete_id}-${s.fecha}-${idx}`}
                      className="flex items-center justify-between py-2.5 text-sm"
                    >
                      <div className="flex flex-col gap-1">
                        <span>{formatearFechaIso(s.fecha)}</span>
                        <span className="text-gris truncate max-w-[200px]">{s.notas || "Sin notas"}</span>
                      </div>
                      {isAdmin && s.id && (
                        <CoachSessionActions sesionId={s.id} fecha={s.fecha} notas={s.notas} />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gris">No hay sesiones registradas.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
