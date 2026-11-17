import type { DbClient } from "@/lib/supabase/types"
import type { Json } from "@/types/database"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import { pesos } from "@/lib/utils/pesos"
import type { ActorErp } from "./abonos"
import { registrarAuditoria } from "./auditoria"
import { OperacionError, exigir, exigirMedioPago, exigirMontoPositivo } from "./errores"
import { cargarTaller } from "./talleres"
import { calcularRepartoTaller, type FilaRepartoTaller, type SocioNomina } from "./talleres-reglas"

// La nomina de cada taller (pedido de Sebastian del 16 nov 2026): la plata de
// los talleres va aparte de la fundacion. Lo recaudado menos los gastos de un
// taller se reparte entre los socios activos con sus porcentajes, menos lo que
// cada uno recibio adelantado a cuenta de ese taller.
//
// Repartir solo se anota (la plata se entrega por fuera, igual que la
// liquidacion). Se puede repartir varias veces: cada vez se reparte lo que
// queda (pagos que llegan despues del cierre). Un reparto equivocado se anula
// con su motivo; nunca se borra. Todo lo hace solo el admin.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA = /^\d{4}-\d{2}-\d{2}$/

export type RepartoTaller = {
  id: string
  fecha: string
  utilidad: number
  recaudado: number
  gastos: number
  estado: string
  notas: string | null
  motivoAnulacion: string | null
  creadoEn: string
  socios: Array<{ socioId: string; nombre: string; porcentaje: number; valor: number; adelantos: number; neto: number }>
}

export type AdelantoTaller = {
  id: string
  socioId: string
  nombre: string
  monto: number
  fecha: string
  metodoPago: string
  notas: string | null
}

async function auditar(supabase: DbClient, actor: ActorErp, fila: { tabla: string; registroId: string; accion: string; antes?: number | null; despues?: number | null; motivo: string }) {
  if (!UUID.test(actor.userId || "")) return
  await registrarAuditoria(supabase, {
    tabla: fila.tabla,
    registroId: fila.registroId,
    usuarioId: actor.userId,
    accion: fila.accion,
    valorAnterior: fila.antes ?? null,
    valorNuevo: fila.despues ?? null,
    motivo: fila.motivo,
  })
}

/**
 * Todo lo de la nomina de un taller: sus cuentas, los repartos hechos, los
 * adelantos a su cuenta y lo que tocaria en el proximo reparto. Null si el
 * taller no existe.
 */
export async function cargarNominaTaller(supabase: DbClient, tallerId: string) {
  const datos = await cargarTaller(supabase, tallerId)
  if (!datos) return null

  const [repartosLeidos, adelantosLeidos, sociosLeidos] = await Promise.all([
    supabase
      .from("talleres_repartos")
      .select("id, fecha, utilidad, recaudado, gastos, estado, notas, motivo_anulacion, creado_en")
      .eq("taller_id", tallerId)
      .order("creado_en", { ascending: true }),
    supabase
      .from("adelantos_socios")
      .select("id, socio_id, monto, fecha, metodo_pago, notas, tipo")
      .eq("taller_id", tallerId)
      .order("fecha", { ascending: true }),
    supabase.from("socios").select("id, nombre, porcentaje_participacion, activo").order("nombre"),
  ])
  if (repartosLeidos.error || adelantosLeidos.error || sociosLeidos.error) {
    throw new OperacionError("No se pudo leer la nómina del taller.")
  }

  const repartoIds = (repartosLeidos.data ?? []).map((r) => r.id)
  const detalle = repartoIds.length
    ? await supabase
        .from("talleres_repartos_socios")
        .select("reparto_id, socio_id, porcentaje, valor_correspondiente, adelantos_descontados, valor_neto")
        .in("reparto_id", repartoIds)
    : { data: [], error: null }
  if (detalle.error) throw new OperacionError("No se pudo leer la nómina del taller.")

  const todosLosSocios = sociosLeidos.data ?? []
  const nombreSocio = new Map(todosLosSocios.map((s) => [s.id, s.nombre ?? "Socio"]))

  const repartos: RepartoTaller[] = (repartosLeidos.data ?? []).map((r) => ({
    id: r.id,
    fecha: r.fecha,
    utilidad: Number(r.utilidad),
    recaudado: Number(r.recaudado),
    gastos: Number(r.gastos),
    estado: r.estado,
    notas: r.notas,
    motivoAnulacion: r.motivo_anulacion,
    creadoEn: r.creado_en,
    socios: (detalle.data ?? [])
      .filter((d) => d.reparto_id === r.id)
      .map((d) => ({
        socioId: d.socio_id,
        nombre: nombreSocio.get(d.socio_id) ?? "Socio",
        porcentaje: Number(d.porcentaje),
        valor: Number(d.valor_correspondiente),
        adelantos: Number(d.adelantos_descontados),
        neto: Number(d.valor_neto),
      }))
      .sort((a, b) => b.porcentaje - a.porcentaje || a.nombre.localeCompare(b.nombre, "es")),
  }))
  const activos = repartos.filter((r) => r.estado === "activo")
  const repartido = activos.reduce((t, r) => t + r.utilidad, 0)

  const adelantos: AdelantoTaller[] = (adelantosLeidos.data ?? []).map((a) => ({
    id: a.id,
    socioId: a.socio_id ?? "",
    nombre: nombreSocio.get(a.socio_id ?? "") ?? "Socio",
    monto: Number(a.monto),
    fecha: a.fecha,
    metodoPago: a.metodo_pago,
    notas: a.notas,
  }))
  // Lo adelantado a cada socio que aun no se le ha descontado en un reparto vigente.
  const adelantosPendientes: Record<string, number> = {}
  for (const a of adelantos) adelantosPendientes[a.socioId] = (adelantosPendientes[a.socioId] ?? 0) + a.monto
  for (const r of activos) {
    for (const s of r.socios) adelantosPendientes[s.socioId] = (adelantosPendientes[s.socioId] ?? 0) - s.adelantos
  }

  const socios: SocioNomina[] = todosLosSocios
    .filter((s) => s.activo)
    .map((s) => ({ id: s.id, nombre: s.nombre ?? "Socio", porcentaje: Number(s.porcentaje_participacion) }))
    .sort((a, b) => b.porcentaje - a.porcentaje || a.nombre.localeCompare(b.nombre, "es"))

  const recaudado = Number(datos.resumen.recaudado)
  const gastos = Number(datos.resumen.gastos)
  const propuesta = calcularRepartoTaller({ recaudado, gastos, repartido, socios, adelantosPendientes })

  return {
    taller: datos.taller,
    recaudado,
    gastos,
    repartido,
    porRepartir: propuesta.porRepartir,
    porCobrar: Number(datos.resumen.porCobrar),
    conDeuda: datos.resumen.conDeuda,
    socios,
    propuesta: propuesta.filas,
    repartos,
    adelantos,
    adelantosPendientes,
  }
}

export type NominaTaller = NonNullable<Awaited<ReturnType<typeof cargarNominaTaller>>>

/** Lo que haria un reparto, sin escribir nada. */
export async function prepararRepartoTaller(supabase: DbClient, tallerId: string, datos: { fecha?: string | null } = {}) {
  const nomina = await cargarNominaTaller(supabase, tallerId)
  if (!nomina) throw new OperacionError("Ese taller no existe.")
  const fecha = String(datos.fecha || fechaHoyBogota())
  if (!FECHA.test(fecha)) throw new OperacionError("La fecha del reparto no es válida (AAAA-MM-DD).")
  if (nomina.porRepartir <= 0) {
    throw new OperacionError(
      nomina.porRepartir < 0
        ? `Este taller va en ${pesos(nomina.porRepartir)}: los gastos y lo repartido superan lo recaudado. No hay nada para repartir.`
        : "No hay nada por repartir: todo lo recaudado ya se repartió."
    )
  }
  if (nomina.socios.length === 0) throw new OperacionError("No hay socios activos para repartir.")
  return { nomina, fecha, filas: nomina.propuesta }
}

/**
 * Reparte entre los socios lo que queda por repartir de un taller y lo deja
 * anotado (con su detalle por socio y en la auditoria). Si alguien repartio
 * mientras tanto, la base lo rechaza y hay que volver a mirar.
 */
export async function repartirTaller(
  supabase: DbClient,
  actor: ActorErp,
  tallerId: string,
  datos: { fecha?: string | null; notas?: string | null } = {}
) {
  if (actor.role !== "admin") throw new OperacionError("Solo el administrador puede repartir un taller.")
  const { nomina, fecha, filas } = await prepararRepartoTaller(supabase, tallerId, datos)
  const notas = String(datos.notas ?? "").trim().slice(0, 500) || null

  const { data: repartoId, error } = await supabase.rpc("fn_guardar_reparto_taller", {
    p_taller_id: tallerId,
    p_fecha: fecha,
    p_recaudado: nomina.recaudado,
    p_gastos: nomina.gastos,
    p_repartido_antes: nomina.repartido,
    p_utilidad: nomina.porRepartir,
    p_notas: notas,
    p_usuario_id: UUID.test(actor.userId || "") ? actor.userId : null,
    p_socios: filas.map((f: FilaRepartoTaller) => ({
      socio_id: f.socioId,
      porcentaje: f.porcentaje,
      valor_correspondiente: f.valor,
      adelantos_descontados: f.adelantos,
      valor_neto: f.neto,
    })) as unknown as Json,
  })
  if (error || !repartoId) throw new OperacionError(error?.message || "No se pudo guardar el reparto.")

  await auditar(supabase, actor, {
    tabla: "talleres_repartos",
    registroId: String(repartoId),
    accion: "repartir_taller",
    despues: nomina.porRepartir,
    motivo: `Reparto de ${nomina.taller.nombre}: ${filas.map((f) => `${f.nombre} ${pesos(f.neto)}`).join(", ")}`,
  })
  return { id: String(repartoId), fecha, utilidad: nomina.porRepartir, filas, tallerNombre: nomina.taller.nombre }
}

/** Anula un reparto: lo que se habia repartido y los adelantos que descontaba vuelven a quedar pendientes. */
export async function anularRepartoTaller(supabase: DbClient, actor: ActorErp, repartoId: string, motivo: string) {
  if (actor.role !== "admin") throw new OperacionError("Solo el administrador puede anular un reparto.")
  exigir(repartoId, "Falta el reparto.")
  const razon = String(motivo ?? "").trim()
  if (razon.length < 3) throw new OperacionError("Escribe por qué se anula el reparto.")
  const { data: reparto, error } = await supabase
    .from("talleres_repartos")
    .select("id, taller_id, utilidad, estado")
    .eq("id", repartoId)
    .maybeSingle()
  if (error) throw new OperacionError("No se pudo leer el reparto.")
  if (!reparto) throw new OperacionError("Ese reparto no existe.")
  if (reparto.estado === "anulado") throw new OperacionError("Ese reparto ya está anulado.")

  const { error: errorUpdate } = await supabase
    .from("talleres_repartos")
    .update({
      estado: "anulado",
      motivo_anulacion: razon.slice(0, 300),
      anulado_en: new Date().toISOString(),
      anulado_por: UUID.test(actor.userId || "") ? actor.userId : null,
    })
    .eq("id", repartoId)
  if (errorUpdate) throw new OperacionError(errorUpdate.message || "No se pudo anular el reparto.")

  await auditar(supabase, actor, {
    tabla: "talleres_repartos",
    registroId: repartoId,
    accion: "anular_reparto_taller",
    antes: Number(reparto.utilidad),
    motivo: razon,
  })
  return { id: repartoId, tallerId: reparto.taller_id, utilidad: Number(reparto.utilidad) }
}

/**
 * Un adelanto a un socio a cuenta de un taller: sale de una cuenta de la
 * fundacion y se le descuenta en el proximo reparto de ese taller (no en la
 * liquidacion de la fundacion).
 */
export async function registrarAdelantoTaller(
  supabase: DbClient,
  actor: ActorErp,
  datos: { tallerId: string; socioId: string; monto: number | string; fecha?: string | null; metodoPago?: string | null; notas?: string | null }
) {
  if (actor.role !== "admin") throw new OperacionError("Solo el administrador puede dar adelantos a los socios.")
  exigir(datos.tallerId, "Falta el taller.")
  exigir(datos.socioId, "Falta el socio.")
  const monto = exigirMontoPositivo(datos.monto)
  const fecha = String(datos.fecha || fechaHoyBogota())
  if (!FECHA.test(fecha)) throw new OperacionError("La fecha no es válida (AAAA-MM-DD).")
  const metodoPago = await exigirMedioPago(supabase, datos.metodoPago || "efectivo")

  const [{ data: taller }, { data: socio }] = await Promise.all([
    supabase.from("talleres").select("id, nombre").eq("id", datos.tallerId).maybeSingle(),
    supabase.from("socios").select("id, nombre, activo").eq("id", datos.socioId).maybeSingle(),
  ])
  if (!taller) throw new OperacionError("Ese taller no existe.")
  if (!socio) throw new OperacionError("Ese socio no existe.")
  if (!socio.activo) throw new OperacionError(`${socio.nombre} no está activo como socio.`)

  const { data, error } = await supabase
    .from("adelantos_socios")
    .insert([
      {
        socio_id: socio.id,
        taller_id: taller.id,
        periodo_id: null,
        monto,
        fecha,
        metodo_pago: metodoPago,
        notas: String(datos.notas ?? "").trim().slice(0, 300) || null,
        usuario_id: UUID.test(actor.userId || "") ? actor.userId : null,
        tipo: "adelanto",
      },
    ])
    .select("id")
    .single()
  if (error || !data) throw new OperacionError(error?.message || "No se pudo guardar el adelanto.")

  await auditar(supabase, actor, {
    tabla: "adelantos_socios",
    registroId: data.id,
    accion: "crear_adelanto_taller",
    despues: monto,
    motivo: `Adelanto a ${socio.nombre} a cuenta de ${taller.nombre}`,
  })
  return { id: data.id, monto, fecha, socio: socio.nombre, taller: taller.nombre }
}

/**
 * Quita un adelanto a cuenta de un taller que se registro por error. Solo si
 * todavia no se le ha descontado en un reparto: si ya se desconto, primero se
 * anula ese reparto.
 */
export async function quitarAdelantoTaller(supabase: DbClient, actor: ActorErp, adelantoId: string) {
  if (actor.role !== "admin") throw new OperacionError("Solo el administrador puede quitar adelantos.")
  const { data: adelanto } = await supabase
    .from("adelantos_socios")
    .select("id, taller_id, socio_id, monto")
    .eq("id", adelantoId)
    .maybeSingle()
  if (!adelanto || !adelanto.taller_id) throw new OperacionError("Ese adelanto no es de un taller.")
  const nomina = await cargarNominaTaller(supabase, adelanto.taller_id)
  if (!nomina) throw new OperacionError("Ese taller no existe.")
  const pendiente = nomina.adelantosPendientes[adelanto.socio_id ?? ""] ?? 0
  if (Number(adelanto.monto) > pendiente + 0.005) {
    throw new OperacionError("Ese adelanto ya se descontó en un reparto: si fue un error, anula primero ese reparto.")
  }
  const { error } = await supabase.from("adelantos_socios").delete().eq("id", adelantoId)
  if (error) throw new OperacionError(error.message || "No se pudo quitar el adelanto.")
  await auditar(supabase, actor, {
    tabla: "adelantos_socios",
    registroId: adelantoId,
    accion: "eliminar_adelanto_taller",
    antes: Number(adelanto.monto),
    motivo: `Adelanto quitado de ${nomina.taller.nombre}`,
  })
  return { id: adelantoId }
}
