import { createAdminClient } from "@/lib/supabase/admin"
import { CABECERAS_SIN_CACHE, respuestaNoAutorizada, secretoAgendaValido } from "@/lib/integraciones/agenda-auth"
import { calcularDiferencias, guardarSnapshotAgenda, type EventoAgenda } from "@/lib/operaciones/agenda-sync"
import { OperacionError } from "@/lib/operaciones/errores"
import { mensajeDeError } from "@/lib/utils/errores"
import { objeto, textoONulo } from "@/lib/utils/lectura"

// La agenda reporta aqui sus sesiones coach de una ventana de fechas.
//
// Esto NO escribe contabilidad: guarda un espejo de lo que hay en el
// calendario para poder compararlo con lo registrado y avisar de diferencias.
// Quien decide que se registra sigue siendo la persona, desde el ERP.

export const dynamic = "force-dynamic"
export const maxDuration = 30

/** Sesiones coach que se guardan por reporte. */
const MAX_EVENTOS = 500
/** Tope duro de eventos crudos que se leen, para no procesar un cuerpo enorme. */
const MAX_ENTRADA = 5_000

/**
 * El recorte va DESPUES de filtrar las sesiones coach. Recortar antes hacia que
 * un calendario cargado de eventos normales (reuniones, festivos, viajes)
 * empujara las sesiones fuera del reporte: llegaban de menos y el ERP las daba
 * por borradas. Tambien avisa si el reporte quedo recortado, porque entonces no
 * se puede dar por borrado nada.
 */
/**
 * Codigo de persona: solo un entero positivo. Antes un codigo vacio ("") pasaba
 * como 0 (Number("") es 0) y aparecia como "persona que no esta en el ERP".
 */
function codigoValido(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isInteger(valor) && valor > 0 ? valor : null
  if (typeof valor === "string" && /^\d{1,9}$/.test(valor.trim())) {
    const n = Number(valor.trim())
    return n > 0 ? n : null
  }
  return null
}

const texto = (valor: unknown, maximo: number) => textoONulo(valor)?.slice(0, maximo) ?? null

function normalizarEventos(valor: unknown): { eventos: EventoAgenda[]; completo: boolean } {
  if (!Array.isArray(valor)) return { eventos: [], completo: false }
  const coach = valor
    .slice(0, MAX_ENTRADA)
    .map((crudo): EventoAgenda => {
      const e = objeto(crudo)
      return {
        id: String(e.id || "").slice(0, 128),
        workspaceId: String(e.workspaceId || "").slice(0, 128),
        codigoPersona: codigoValido(e.clientCode ?? e.codigoPersona),
        nombrePersona: texto(e.clientName ?? e.nombrePersona, 200),
        fecha: String(e.date ?? e.fecha ?? "").slice(0, 10),
        inicio: texto(e.startAt ?? e.inicio, 40),
        titulo: texto(e.title ?? e.titulo, 300),
        modalidad: texto(e.modality ?? e.modalidad, 60),
        hecho: Boolean(e.done ?? e.hecho),
      }
    })
    // Solo sesiones coach: el resto del calendario (reuniones, festivos) no
    // tiene nada que ver con la contabilidad.
    .filter((e) => e.id && e.codigoPersona !== null && /^\d{4}-\d{2}-\d{2}$/.test(e.fecha))

  return {
    eventos: coach.slice(0, MAX_EVENTOS),
    completo: valor.length <= MAX_ENTRADA && coach.length <= MAX_EVENTOS,
  }
}

export async function POST(req: Request) {
  if (!secretoAgendaValido(req)) return respuestaNoAutorizada()

  const admin = createAdminClient()
  if (!admin) {
    return Response.json({ error: "servidor_no_configurado" }, { status: 500, headers: CABECERAS_SIN_CACHE })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const workspaceId = String(body?.workspaceId || "").slice(0, 128)
    const desde = String(body?.desde || "").slice(0, 10)
    const hasta = String(body?.hasta || "").slice(0, 10)
    const { eventos, completo } = normalizarEventos(body?.eventos)

    const resultado = await guardarSnapshotAgenda(admin, {
      workspaceId,
      desde,
      hasta,
      eventos,
      reporteCompleto: completo,
    })
    const diferencias = await calcularDiferencias(admin, { desde, hasta })

    return Response.json(
      {
        ...resultado,
        reporteCompleto: completo,
        aviso: completo
          ? undefined
          : "El reporte llego recortado: no se dio nada por borrado. Manda la ventana en tramos mas cortos.",
        diferencias: diferencias.length,
        // Se devuelve un resumen para que la agenda pueda avisar si quiere,
        // pero la revision de verdad se hace desde el ERP.
        resumen: diferencias.slice(0, 10).map((d) => ({ tipo: d.tipo, mensaje: d.mensaje })),
      },
      { headers: CABECERAS_SIN_CACHE }
    )
  } catch (error) {
    if (error instanceof OperacionError) {
      return Response.json({ error: error.message }, { status: 400, headers: CABECERAS_SIN_CACHE })
    }
    console.error("[integraciones/agenda/sincronizar] fallo", { message: mensajeDeError(error, "desconocido") })
    return Response.json({ error: "error_interno" }, { status: 500, headers: CABECERAS_SIN_CACHE })
  }
}
