import { OperacionError } from "./errores"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import { cargarEstadoCupo, repartirCupo, type Cobertura } from "./agenda-cobertura"

// Reconciliacion entre la AGENDA (calendario de la familia) y el ERP
// (contabilidad).
//
// Reglas acordadas con el duenio:
//  - La agenda manda en FECHAS: si alli mueven una sesion, esa es la fecha
//    buena, porque es donde se reprograma de verdad.
//  - El ERP manda en DINERO: lo que se cobro y se pago no lo decide el
//    calendario.
//  - Nada de la agenda entra a la contabilidad sin aprobacion explicita.
//
// Este modulo NO escribe en cuentas: solo compara y describe diferencias.

export type EventoAgenda = {
  id: string
  workspaceId: string
  codigoPersona: number | null
  nombrePersona: string | null
  fecha: string
  inicio?: string | null
  titulo?: string | null
  modalidad?: string | null
  hecho?: boolean
}

export type TipoDiferencia =
  | "sesion_sin_registrar"
  | "fecha_movida"
  | "evento_borrado_con_sesion"
  | "persona_nueva"

export type Diferencia = {
  tipo: TipoDiferencia
  eventoId: string
  fecha: string
  codigoPersona: number | null
  nombrePersona: string | null
  /** Frase lista para mostrarle a la persona. */
  mensaje: string
  /** Que se propone hacer si lo apruebas. */
  accionSugerida: string
  /**
   * Solo en sesion_sin_registrar: si esa sesion ya venia comprada y si el
   * paquete de donde sale esta pagado. Es la diferencia entre "descontala del
   * paquete" y "hay que cobrarla".
   */
  cobertura?: Cobertura
  detalle?: Record<string, unknown>
}

/** Solo interesan las sesiones coach: el resto de la agenda es ruido aqui. */
export function esEventoCoach(evento: { codigoPersona?: number | null; kind?: string }) {
  return evento.kind === "coach" || (evento.codigoPersona !== null && evento.codigoPersona !== undefined)
}

/**
 * Guarda el espejo de lo que reporta la agenda. Los eventos de la ventana que
 * NO vengan en este reporte se marcan como eliminados: asi se detecta cuando
 * borran algo del calendario.
 */
export async function guardarSnapshotAgenda(
  admin: any,
  params: { workspaceId: string; desde: string; hasta: string; eventos: EventoAgenda[] }
) {
  const { workspaceId, desde, hasta, eventos } = params

  if (!workspaceId) throw new OperacionError("Falta la agenda de origen.")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    throw new OperacionError("La ventana de fechas no es valida.")
  }

  const filas = eventos.map((e) => ({
    id: e.id,
    workspace_id: workspaceId,
    codigo_persona: e.codigoPersona ?? null,
    nombre_persona: e.nombrePersona ?? null,
    fecha: e.fecha,
    inicio: e.inicio ?? null,
    titulo: e.titulo ?? null,
    modalidad: e.modalidad ?? null,
    hecho: Boolean(e.hecho),
    eliminado: false,
    visto_en: new Date().toISOString(),
  }))

  if (filas.length) {
    const { error } = await admin.from("agenda_eventos").upsert(filas, { onConflict: "id" })
    if (error) throw new OperacionError("No se pudo guardar el reporte de la agenda.")
  }

  // Lo que estaba en la ventana y ya no lo reportan: se borro en la agenda.
  const vistos = filas.map((f) => f.id)
  let query = admin
    .from("agenda_eventos")
    .update({ eliminado: true })
    .eq("workspace_id", workspaceId)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .eq("eliminado", false)

  if (vistos.length) query = query.not("id", "in", `(${vistos.map((v) => `"${v}"`).join(",")})`)

  const { error: errorBorrados } = await query
  if (errorBorrados) {
    console.error("[agenda-sync] no se pudieron marcar los borrados", { code: errorBorrados.code })
  }

  return { recibidos: filas.length, ventana: { desde, hasta } }
}

/**
 * Compara la agenda con el ERP y devuelve lo que hay que revisar. Nunca
 * escribe: solo describe.
 */
export async function calcularDiferencias(
  admin: any,
  opciones: { desde: string; hasta: string; incluirResueltas?: boolean }
): Promise<Diferencia[]> {
  const { desde, hasta } = opciones

  const [{ data: eventos, error: errorEventos }, { data: resueltas }] = await Promise.all([
    admin
      .from("agenda_eventos")
      .select("id, codigo_persona, nombre_persona, fecha, titulo, hecho, eliminado")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .not("codigo_persona", "is", null)
      .order("fecha", { ascending: false }),
    opciones.incluirResueltas
      ? Promise.resolve({ data: [] })
      : admin.from("agenda_diferencias_resueltas").select("evento_id, tipo"),
  ])

  if (errorEventos) throw new OperacionError("No se pudieron leer los eventos de la agenda.")

  const yaResuelto = new Set((resueltas || []).map((r: any) => `${r.evento_id}|${r.tipo}`))
  const lista = eventos || []
  if (!lista.length) return []

  const codigos = Array.from(new Set(lista.map((e: any) => String(e.codigo_persona))))

  const { data: personas } = await admin
    .from("asistentes")
    .select("id, codigo, nombre")
    .in("codigo", codigos)

  const porCodigo = new Map<string, any>((personas || []).map((p: any) => [String(p.codigo), p]))

  // Sesiones del ERP en la ventana, para cruzarlas con los eventos.
  const { data: sesiones } = await admin
    .from("coach_sesiones")
    .select("id, asistente_id, fecha, evento_agenda_id")
    .gte("fecha", desde)
    .lte("fecha", hasta)

  const porEvento = new Map<string, any>()
  const porPersonaFecha = new Map<string, any>()
  for (const s of sesiones || []) {
    if (s.evento_agenda_id) porEvento.set(s.evento_agenda_id, s)
    porPersonaFecha.set(`${s.asistente_id}|${s.fecha}`, s)
  }

  // En Colombia, no en UTC: el servidor corre en UTC y de noche ya va un dia
  // adelante, asi que una sesion de manana se reportaba como "ya dictada".
  const hoy = fechaHoyBogota()
  const diferencias: Diferencia[] = []

  const agregar = (d: Diferencia) => {
    if (!yaResuelto.has(`${d.eventoId}|${d.tipo}`)) diferencias.push(d)
  }

  for (const ev of lista) {
    const codigo = String(ev.codigo_persona)
    const persona = porCodigo.get(codigo)
    const nombre = persona?.nombre || ev.nombre_persona || `código ${codigo}`

    // 1) La agenda tiene a alguien que el ERP no conoce.
    if (!persona) {
      agregar({
        tipo: "persona_nueva",
        eventoId: ev.id,
        fecha: ev.fecha,
        codigoPersona: ev.codigo_persona,
        nombrePersona: ev.nombre_persona,
        mensaje: `"${ev.nombre_persona || codigo}" (código ${codigo}) tiene sesión agendada el ${ev.fecha} pero no existe en el ERP.`,
        accionSugerida: "Crear la persona en el ERP con ese código.",
      })
      continue
    }

    const sesionEnlazada = porEvento.get(ev.id)
    const sesionMismaFecha = porPersonaFecha.get(`${persona.id}|${ev.fecha}`)

    // 2) Borraron el evento pero la sesion ya estaba registrada (y cobrada).
    if (ev.eliminado) {
      if (sesionEnlazada) {
        agregar({
          tipo: "evento_borrado_con_sesion",
          eventoId: ev.id,
          fecha: ev.fecha,
          codigoPersona: ev.codigo_persona,
          nombrePersona: nombre,
          mensaje: `Se borró de la agenda la sesión de ${nombre} del ${ev.fecha}, pero en el ERP sigue registrada.`,
          accionSugerida: "Revisar si de verdad no se dictó; si no, eliminar la sesión del ERP.",
          detalle: { sesionErpId: sesionEnlazada.id },
        })
      }
      continue
    }

    // 3) La agenda movió la fecha. Manda la agenda: se propone corregir el ERP.
    if (sesionEnlazada && sesionEnlazada.fecha !== ev.fecha) {
      agregar({
        tipo: "fecha_movida",
        eventoId: ev.id,
        fecha: ev.fecha,
        codigoPersona: ev.codigo_persona,
        nombrePersona: nombre,
        mensaje: `La sesión de ${nombre} se movió: la agenda dice ${ev.fecha} y el ERP tiene ${sesionEnlazada.fecha}.`,
        accionSugerida: `Actualizar la fecha en el ERP a ${ev.fecha}.`,
        detalle: { sesionErpId: sesionEnlazada.id, fechaErp: sesionEnlazada.fecha },
      })
      continue
    }

    // 4) Ya pasó y no está registrada. Es el caso que más se olvida.
    if (!sesionEnlazada && !sesionMismaFecha && ev.fecha <= hoy) {
      agregar({
        tipo: "sesion_sin_registrar",
        eventoId: ev.id,
        fecha: ev.fecha,
        codigoPersona: ev.codigo_persona,
        nombrePersona: nombre,
        mensaje: `${nombre} tuvo sesión el ${ev.fecha} según la agenda, pero no está registrada en el ERP.`,
        accionSugerida: "Registrar la sesión (y su cobro) si de verdad se dictó.",
        detalle: { asistenteId: persona.id, codigo },
      })
    }
  }

  await adjuntarCobertura(admin, diferencias)

  const orden: Record<TipoDiferencia, number> = {
    evento_borrado_con_sesion: 0,
    sesion_sin_registrar: 1,
    fecha_movida: 2,
    persona_nueva: 3,
  }
  return diferencias.sort((a, b) => orden[a.tipo] - orden[b.tipo] || (a.fecha < b.fecha ? 1 : -1))
}

/**
 * Le dice a cada sesion sin registrar si ya venia comprada y si esta pagada.
 *
 * Se reparte por persona y por fecha: el cupo es un saldo que se agota, no una
 * respuesta que valga igual para todas sus sesiones pendientes.
 */
async function adjuntarCobertura(admin: any, diferencias: Diferencia[]) {
  const porPersona = new Map<string, Diferencia[]>()
  for (const d of diferencias) {
    if (d.tipo !== "sesion_sin_registrar") continue
    const asistenteId = String((d.detalle as any)?.asistenteId || "")
    if (!asistenteId) continue
    const lista = porPersona.get(asistenteId) || []
    lista.push(d)
    porPersona.set(asistenteId, lista)
  }
  if (!porPersona.size) return

  let estados
  try {
    estados = await cargarEstadoCupo(admin, Array.from(porPersona.keys()))
  } catch (error: any) {
    // Avisar sin el cupo sigue siendo mejor que no avisar.
    console.error("[agenda-sync] no se pudo calcular el cupo", { message: error?.message })
    return
  }

  for (const [asistenteId, lista] of Array.from(porPersona.entries())) {
    // De la mas vieja a la mas nueva: es el orden en que se registrarian.
    lista.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
    const coberturas = repartirCupo(estados.get(asistenteId), lista.length)
    lista.forEach((d, i) => {
      const cobertura = coberturas[i]
      d.cobertura = cobertura
      d.accionSugerida = cobertura.accion
    })
  }
}

export async function marcarDiferenciaResuelta(
  admin: any,
  params: { eventoId: string; tipo: TipoDiferencia; decision: string; usuarioId?: string; nota?: string }
) {
  const { error } = await admin.from("agenda_diferencias_resueltas").upsert(
    {
      evento_id: params.eventoId,
      tipo: params.tipo,
      decision: params.decision,
      usuario_id: params.usuarioId || null,
      nota: params.nota || null,
    },
    { onConflict: "evento_id,tipo" }
  )
  if (error) throw new OperacionError("No se pudo guardar la decisión.")
  return { eventoId: params.eventoId, tipo: params.tipo, decision: params.decision }
}
