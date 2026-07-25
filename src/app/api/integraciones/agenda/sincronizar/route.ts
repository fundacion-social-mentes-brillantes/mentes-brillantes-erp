import { createAdminClient } from "@/lib/supabase/admin"
import { CABECERAS_SIN_CACHE, respuestaNoAutorizada, secretoAgendaValido } from "@/lib/integraciones/agenda-auth"
import { calcularDiferencias, guardarSnapshotAgenda, type EventoAgenda } from "@/lib/operaciones/agenda-sync"
import { OperacionError } from "@/lib/operaciones/errores"

// La agenda reporta aqui sus sesiones coach de una ventana de fechas.
//
// Esto NO escribe contabilidad: guarda un espejo de lo que hay en el
// calendario para poder compararlo con lo registrado y avisar de diferencias.
// Quien decide que se registra sigue siendo la persona, desde el ERP.

export const dynamic = "force-dynamic"
export const maxDuration = 30

const MAX_EVENTOS = 500

function normalizarEventos(valor: unknown): EventoAgenda[] {
  if (!Array.isArray(valor)) return []
  return valor
    .slice(0, MAX_EVENTOS)
    .map((e: any) => ({
      id: String(e?.id || "").slice(0, 128),
      workspaceId: String(e?.workspaceId || "").slice(0, 128),
      codigoPersona: Number.isFinite(Number(e?.clientCode ?? e?.codigoPersona))
        ? Number(e?.clientCode ?? e?.codigoPersona)
        : null,
      nombrePersona: e?.clientName ?? e?.nombrePersona ?? null,
      fecha: String(e?.date ?? e?.fecha ?? "").slice(0, 10),
      inicio: e?.startAt ?? e?.inicio ?? null,
      titulo: typeof e?.title === "string" ? e.title.slice(0, 300) : (e?.titulo ?? null),
      modalidad: e?.modality ?? e?.modalidad ?? null,
      hecho: Boolean(e?.done ?? e?.hecho),
    }))
    // Solo sesiones coach: el resto del calendario (reuniones, festivos) no
    // tiene nada que ver con la contabilidad.
    .filter((e) => e.id && e.codigoPersona !== null && /^\d{4}-\d{2}-\d{2}$/.test(e.fecha))
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
    const eventos = normalizarEventos(body?.eventos)

    const resultado = await guardarSnapshotAgenda(admin, { workspaceId, desde, hasta, eventos })
    const diferencias = await calcularDiferencias(admin, { desde, hasta })

    return Response.json(
      {
        ...resultado,
        diferencias: diferencias.length,
        // Se devuelve un resumen para que la agenda pueda avisar si quiere,
        // pero la revision de verdad se hace desde el ERP.
        resumen: diferencias.slice(0, 10).map((d) => ({ tipo: d.tipo, mensaje: d.mensaje })),
      },
      { headers: CABECERAS_SIN_CACHE }
    )
  } catch (error: any) {
    if (error instanceof OperacionError) {
      return Response.json({ error: error.message }, { status: 400, headers: CABECERAS_SIN_CACHE })
    }
    console.error("[integraciones/agenda/sincronizar] fallo", { message: error?.message })
    return Response.json({ error: "error_interno" }, { status: 500, headers: CABECERAS_SIN_CACHE })
  }
}
