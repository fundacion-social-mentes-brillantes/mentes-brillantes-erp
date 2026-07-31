import { registrarSesionCoach } from "@/lib/operaciones/coach"
import { resumenCoach } from "@/lib/utils/coach"
import { OperacionError } from "@/lib/operaciones/errores"

// Pasar una sesion de la AGENDA a la contabilidad, desde el boton de la agenda.
//
// Hasta ahora la agenda solo reportaba y el dueno registraba desde el ERP. Este
// modulo abre la puerta de escritura, pero angosta a proposito:
//
//  - Solo descuenta de un paquete YA COMPRADO. Nunca crea cuentas ni cobra: si
//    no hay cupo, contesta que no y no escribe nada. Vender es una decision de
//    plata y esa se sigue tomando en el ERP.
//  - Es idempotente. Si vuelven a oprimir el boton, o si la sesion ya se habia
//    registrado a mano, avisa que ya estaba en vez de duplicarla.
//  - Deja el enlace al evento (`evento_agenda_id`), para que el ERP pueda notar
//    despues si borran de la agenda algo ya cobrado.

export type ResultadoRegistro =
  | { estado: "registrada"; persona: string; fecha: string; mensaje: string; coach: ResumenCupo; paquete: string | null }
  | { estado: "ya_estaba"; persona: string; fecha: string; mensaje: string; coach: ResumenCupo }
  | { estado: "sin_cupo"; persona: string; fecha: string; mensaje: string; detalle: string; coach: ResumenCupo }
  | { estado: "persona_desconocida"; codigo: string; mensaje: string }

export type ResumenCupo = { compradas: number; realizadas: number; restantes: number }

async function paquetesDe(admin: any, asistenteId: string) {
  const { data, error } = await admin
    .from("coach_paquetes")
    .select("id, cuenta_id, sesiones_compradas, creado_en, coach_sesiones (id), cuentas_por_cobrar (concepto)")
    .eq("asistente_id", asistenteId)

  if (error) throw new OperacionError("No se pudieron consultar los paquetes coach.")
  return data || []
}

/** Ya registrada si esta enlazada a este evento, o si esa persona ya tiene una sesion ese dia. */
async function sesionYaRegistrada(admin: any, asistenteId: string, fecha: string, eventoAgendaId: string | null) {
  const { data, error } = await admin
    .from("coach_sesiones")
    .select("id, evento_agenda_id, fecha")
    .eq("asistente_id", asistenteId)
    .eq("fecha", fecha)
    .limit(1)
  if (error) throw new OperacionError("No se pudo revisar si la sesion ya estaba registrada.")
  if (data && data.length) return true

  if (eventoAgendaId) {
    const { data: porEvento } = await admin
      .from("coach_sesiones")
      .select("id")
      .eq("evento_agenda_id", eventoAgendaId)
      .limit(1)
    if (porEvento && porEvento.length) return true
  }

  return false
}

export async function pasarSesionDeAgendaAlErp(
  admin: any,
  params: { codigo: string; fecha: string; eventoAgendaId?: string | null }
): Promise<ResultadoRegistro> {
  const codigo = String(params.codigo).trim()
  const fecha = String(params.fecha).trim()
  const eventoAgendaId = params.eventoAgendaId ? String(params.eventoAgendaId).trim().slice(0, 128) : null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new OperacionError("La fecha de la sesion no es valida.")

  const { data: persona, error } = await admin
    .from("asistentes")
    .select("id, nombre, codigo")
    .eq("codigo", codigo)
    .maybeSingle()

  if (error) throw new OperacionError("No se pudo consultar la persona.")
  if (!persona) {
    return {
      estado: "persona_desconocida",
      codigo,
      mensaje: `El código ${codigo} no existe en el ERP. Hay que crear la persona allá primero.`,
    }
  }

  const paquetes = await paquetesDe(admin, persona.id)
  const cupo = resumenCoach(paquetes as any)

  if (await sesionYaRegistrada(admin, persona.id, fecha, eventoAgendaId)) {
    return {
      estado: "ya_estaba",
      persona: persona.nombre,
      fecha,
      mensaje: `${persona.nombre} ya tiene registrada la sesión del ${fecha} en el ERP.`,
      coach: cupo,
    }
  }

  // El caso que el boton tiene que saber contar: no hay de donde descontar.
  if (cupo.restantes <= 0) {
    const detalle = paquetes.length
      ? `Compró ${cupo.compradas} y ya tomó ${cupo.realizadas}.`
      : "No tiene ningún paquete coach comprado."
    return {
      estado: "sin_cupo",
      persona: persona.nombre,
      fecha,
      mensaje: `${persona.nombre} no tiene sesiones disponibles.`,
      detalle: `${detalle} Hay que venderle el paquete desde el ERP antes de pasar esta sesión.`,
      coach: cupo,
    }
  }

  const registrada = await registrarSesionCoach(
    admin,
    { userId: "agenda", role: "caja" },
    { asistenteId: persona.id, fecha, eventoAgendaId }
  )

  const destino = paquetes.find((p: any) => p.id === registrada.paqueteId)
  const cuenta = Array.isArray(destino?.cuentas_por_cobrar)
    ? destino?.cuentas_por_cobrar[0]
    : destino?.cuentas_por_cobrar

  return {
    estado: "registrada",
    persona: persona.nombre,
    fecha,
    mensaje: `Sesión del ${fecha} registrada en el ERP. A ${persona.nombre} le quedan ${registrada.restantesDespues}.`,
    paquete: cuenta?.concepto ?? null,
    coach: { ...cupo, realizadas: cupo.realizadas + 1, restantes: registrada.restantesDespues },
  }
}

export type EventoConsultado = { id: string; codigo?: string | null; fecha?: string | null }

/**
 * Cuales de estos eventos ya estan en la contabilidad, para pintar el boton.
 *
 * Cruza por DOS caminos, y el segundo es el que importa: el enlace directo
 * (evento_agenda_id) solo existe cuando la sesion se paso desde la agenda. Si
 * el duenio la registro en el ERP —que es lo normal— la fila queda con el
 * enlace vacio y un NULL nunca entra en un IN, asi que el evento se quedaba
 * gris para siempre aunque la sesion SI estuviera registrada.
 *
 * Por eso tambien se cruza por persona+fecha, que es el mismo criterio que ya
 * usan sesionYaRegistrada y el panel de diferencias. Y cuando se encuentra por
 * ahi, se aprovecha para rellenar el enlace que faltaba: asi el verde no se
 * pierde al recargar y el ERP recupera la capacidad de notar que borraron de la
 * agenda algo ya cobrado.
 */
export async function eventosYaEnElErp(
  admin: any,
  eventos: Array<EventoConsultado | string>
): Promise<string[]> {
  const lista: EventoConsultado[] = eventos
    .map((e) => (typeof e === "string" ? { id: e } : e))
    .filter((e) => e && e.id)
    .slice(0, 200)

  if (!lista.length) return []

  const ids = Array.from(new Set(lista.map((e) => e.id)))
  const registrados = new Set<string>()

  // 1) Enlace directo.
  const { data: porEnlace, error } = await admin
    .from("coach_sesiones")
    .select("evento_agenda_id")
    .in("evento_agenda_id", ids)

  if (error) throw new OperacionError("No se pudo consultar el estado de los eventos.")
  for (const s of porEnlace || []) if (s.evento_agenda_id) registrados.add(s.evento_agenda_id)

  // 2) Persona + fecha, para lo registrado directamente en el ERP.
  const conDatos = lista.filter((e) => !registrados.has(e.id) && e.codigo && e.fecha)
  if (!conDatos.length) return Array.from(registrados)

  const codigos = Array.from(new Set(conDatos.map((e) => String(e.codigo))))
  const { data: personas } = await admin.from("asistentes").select("id, codigo").in("codigo", codigos)

  const idPorCodigo = new Map<string, string>((personas || []).map((p: any) => [String(p.codigo), p.id]))
  if (!idPorCodigo.size) return Array.from(registrados)

  const fechas = Array.from(new Set(conDatos.map((e) => String(e.fecha))))
  const { data: sesiones } = await admin
    .from("coach_sesiones")
    .select("id, asistente_id, fecha, evento_agenda_id")
    .in("asistente_id", Array.from(new Set(idPorCodigo.values())))
    .in("fecha", fechas)

  const porPersonaFecha = new Map<string, any>()
  for (const s of sesiones || []) porPersonaFecha.set(`${s.asistente_id}|${s.fecha}`, s)

  const porRellenar: Array<{ sesionId: string; eventoId: string }> = []
  for (const evento of conDatos) {
    const asistenteId = idPorCodigo.get(String(evento.codigo))
    if (!asistenteId) continue
    const sesion = porPersonaFecha.get(`${asistenteId}|${evento.fecha}`)
    if (!sesion) continue

    registrados.add(evento.id)
    if (!sesion.evento_agenda_id) porRellenar.push({ sesionId: sesion.id, eventoId: evento.id })
  }

  // Rellenar el enlace es lo que hace que el verde no se pierda al recargar.
  // Si falla no se cae la consulta: el verde ya se contesto bien.
  for (const { sesionId, eventoId } of porRellenar) {
    const { error: errorEnlace } = await admin
      .from("coach_sesiones")
      .update({ evento_agenda_id: eventoId })
      .eq("id", sesionId)
      .is("evento_agenda_id", null)
    if (errorEnlace) {
      console.error("[agenda-registro] no se pudo enlazar la sesion con su evento", {
        code: errorEnlace.code,
      })
    }
  }

  return Array.from(registrados)
}
