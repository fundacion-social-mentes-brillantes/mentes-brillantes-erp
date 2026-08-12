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

export type ResultadoSnapshot = {
  recibidos: number
  ventana: { desde: string; hasta: string }
  /** Tramo en el que se dio algo por borrado. null cuando no se barrió nada. */
  ventanaBarrida: { desde: string; hasta: string } | null
  marcadosEliminados: number
  /** Por qué no se barrió, cuando no se barrió. */
  sinBarrer?: "reporte_incompleto" | "reporte_vacio" | "fallo_al_barrer"
}

/**
 * Guarda el espejo de lo que reporta la agenda. Los eventos de la ventana que
 * NO vengan en este reporte se marcan como eliminados: asi se detecta cuando
 * borran algo del calendario.
 *
 * Dar algo por borrado no es gratis: un evento marcado asi deja de compararse
 * (ver calcularDiferencias), y si esa sesion si se dicto se queda dictada y
 * sin cobrar, sin que nadie avise. Un reporte que llega recortado no dice
 * "esto se borro", dice "de esto no alcance a contarte". Por eso solo se barre
 * lo que el reporte de verdad alcanzo a cubrir:
 *
 *  - reporte recortado (reporteCompleto: false) o vacio: no se barre nada.
 *  - nunca mas alla de la ultima fecha reportada: si el reporte dejo de contar
 *    en el 31 de julio, lo de agosto no esta borrado, es que no lo contaron.
 *
 * Equivocarse al reves solo cuesta que siga preguntando por una sesion que ya
 * cancelaron, y eso se responde una vez.
 */
export async function guardarSnapshotAgenda(
  admin: any,
  params: {
    workspaceId: string
    desde: string
    hasta: string
    eventos: EventoAgenda[]
    /** false cuando el reporte llego recortado y no se puede dar por completo. */
    reporteCompleto?: boolean
  }
): Promise<ResultadoSnapshot> {
  const { workspaceId, desde, hasta, eventos, reporteCompleto = true } = params

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

  const ventana = { desde, hasta }
  const sinBarrido = (sinBarrer: ResultadoSnapshot["sinBarrer"]): ResultadoSnapshot => ({
    recibidos: filas.length,
    ventana,
    ventanaBarrida: null,
    marcadosEliminados: 0,
    sinBarrer,
  })

  // Un reporte recortado o vacio no autoriza a borrar nada: no distingue
  // "ya no esta" de "no me lo contaste".
  if (!reporteCompleto) return sinBarrido("reporte_incompleto")
  if (!filas.length) return sinBarrido("reporte_vacio")

  // Lo que estaba en la ventana y ya no lo reportan: se borro en la agenda.
  // Pero solo hasta donde el reporte llego de verdad.
  const ultimaReportada = filas.reduce((max, f) => (f.fecha > max ? f.fecha : max), filas[0].fecha)
  const hastaBarrido = ultimaReportada < hasta ? ultimaReportada : hasta
  const vistos = filas.map((f) => f.id)

  const { data: borrados, error: errorBorrados } = await admin
    .from("agenda_eventos")
    .update({ eliminado: true })
    .eq("workspace_id", workspaceId)
    .gte("fecha", desde)
    .lte("fecha", hastaBarrido)
    .eq("eliminado", false)
    .not("id", "in", `(${vistos.map((v) => `"${v}"`).join(",")})`)
    .select("id")

  if (errorBorrados) {
    console.error("[agenda-sync] no se pudieron marcar los borrados", { code: errorBorrados.code })
    return sinBarrido("fallo_al_barrer")
  }

  return {
    recibidos: filas.length,
    ventana,
    ventanaBarrida: { desde, hasta: hastaBarrido },
    marcadosEliminados: Array.isArray(borrados) ? borrados.length : 0,
  }
}

export type EspejoAgenda = {
  /** Ultima vez que la agenda reporto algo, en cualquier ventana. */
  ultimoReporte: string | null
  diasSinReporte: number | null
  eventosEnVentana: number
  eventosVivos: number
  eventosDadosPorBorrados: number
  /** Ultima fecha con sesion viva en el espejo dentro de la ventana. */
  ultimaFechaConSesion: string | null
  /**
   * Frase corta cuando el espejo no da para concluir nada. Existe para que
   * "no hay diferencias" no se confunda con "no hay datos".
   */
  aviso: string | null
}

/** A partir de aqui se considera que la agenda dejo de reportar. */
const DIAS_TOLERANCIA_REPORTE = 2

/**
 * Que tan confiable es la comparacion. El cruce se hace contra el espejo, no
 * contra la agenda en vivo: si la agenda no reporta, el cruce sale limpio
 * aunque falten sesiones. Esto lo dice en voz alta.
 */
export async function resumenEspejoAgenda(
  admin: any,
  opciones: { desde: string; hasta: string; ahora?: number }
): Promise<EspejoAgenda> {
  const { desde, hasta } = opciones
  const vacio: EspejoAgenda = {
    ultimoReporte: null,
    diasSinReporte: null,
    eventosEnVentana: 0,
    eventosVivos: 0,
    eventosDadosPorBorrados: 0,
    ultimaFechaConSesion: null,
    aviso: null,
  }

  const [enVentana, ultimo] = await Promise.all([
    admin
      .from("agenda_eventos")
      .select("fecha, eliminado")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .not("codigo_persona", "is", null),
    admin.from("agenda_eventos").select("visto_en").order("visto_en", { ascending: false }).limit(1),
  ])

  if (enVentana?.error || ultimo?.error) {
    return { ...vacio, aviso: "No se pudo revisar si la agenda esta reportando: toma esta comparacion con pinzas." }
  }

  const lista = (enVentana?.data || []) as Array<{ fecha: string; eliminado: boolean }>
  const vivos = lista.filter((e) => !e.eliminado)
  const ultimoReporte = (ultimo?.data || [])[0]?.visto_en ?? null
  const marca = ultimoReporte ? Date.parse(ultimoReporte) : NaN
  const diasSinReporte = Number.isFinite(marca)
    ? Math.max(0, Math.floor(((opciones.ahora ?? Date.now()) - marca) / 86400000))
    : null

  const espejo: EspejoAgenda = {
    ultimoReporte,
    diasSinReporte,
    eventosEnVentana: lista.length,
    eventosVivos: vivos.length,
    eventosDadosPorBorrados: lista.length - vivos.length,
    ultimaFechaConSesion: vivos.reduce<string | null>((max, e) => (!max || e.fecha > max ? e.fecha : max), null),
    aviso: null,
  }

  if (!ultimoReporte) {
    return { ...espejo, aviso: "La agenda todavia no ha reportado sus sesiones al ERP: esta comparacion no prueba nada." }
  }
  if (diasSinReporte !== null && diasSinReporte >= DIAS_TOLERANCIA_REPORTE) {
    return {
      ...espejo,
      aviso: `La agenda no reporta desde hace ${diasSinReporte} dia(s): puede faltar lo mas reciente.`,
    }
  }
  if (!vivos.length) {
    return { ...espejo, aviso: "En esta ventana el espejo no tiene ninguna sesion de la agenda." }
  }
  return espejo
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
