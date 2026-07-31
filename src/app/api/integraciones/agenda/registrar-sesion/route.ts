import { createAdminClient } from "@/lib/supabase/admin"
import { CABECERAS_SIN_CACHE, respuestaNoAutorizada, secretoAgendaValido } from "@/lib/integraciones/agenda-auth"
import { eventosYaEnElErp, pasarSesionDeAgendaAlErp } from "@/lib/integraciones/agenda-registro"
import { OperacionError } from "@/lib/operaciones/errores"

// El boton "pasar al ERP" de la agenda.
//
// POST registra UNA sesion coach descontandola de un paquete ya comprado.
// GET  dice cuales eventos ya estan registrados, para pintar el boton.
//
// Nunca crea cuentas ni cobra: si la persona no tiene cupo, contesta que no y
// no escribe nada. Vender el paquete sigue siendo una decision que se toma en
// el ERP, no desde el calendario.

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(req: Request) {
  if (!secretoAgendaValido(req)) return respuestaNoAutorizada()

  const admin = createAdminClient()
  if (!admin) {
    return Response.json({ error: "servidor_no_configurado" }, { status: 500, headers: CABECERAS_SIN_CACHE })
  }

  try {
    const body = await req.json().catch(() => ({}))

    // Modo consulta: llega una lista de eventos con su persona y fecha. Va por
    // POST y no por GET porque son hasta 200 eventos y no caben comodos en la
    // direccion.
    if (Array.isArray(body?.eventos)) {
      const eventos = body.eventos
        .map((e: any) => ({
          id: String(e?.id ?? "").trim(),
          codigo: e?.codigo === undefined || e?.codigo === null ? null : String(e.codigo).trim(),
          fecha: typeof e?.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.fecha) ? e.fecha : null,
        }))
        .filter((e: any) => e.id)

      const registrados = await eventosYaEnElErp(admin, eventos)
      return Response.json({ registrados }, { headers: CABECERAS_SIN_CACHE })
    }

    const codigo = String(body?.codigo ?? body?.clientCode ?? "").trim()
    const fecha = String(body?.fecha ?? body?.date ?? "").trim()
    const eventoAgendaId = String(body?.eventoId ?? body?.eventoAgendaId ?? "").trim() || null

    if (!codigo || !fecha) {
      return Response.json(
        { error: "faltan_datos", mensaje: "Falta el código de la persona o la fecha de la sesión." },
        { status: 400, headers: CABECERAS_SIN_CACHE }
      )
    }

    const resultado = await pasarSesionDeAgendaAlErp(admin, { codigo, fecha, eventoAgendaId })

    // Sin cupo NO es un fallo del sistema: es una respuesta legitima que la
    // agenda tiene que poder mostrar. Por eso va con 200 y no con error.
    return Response.json(resultado, { headers: CABECERAS_SIN_CACHE })
  } catch (error: any) {
    if (error instanceof OperacionError) {
      return Response.json(
        { error: "operacion_invalida", mensaje: error.message },
        { status: 400, headers: CABECERAS_SIN_CACHE }
      )
    }
    console.error("[integraciones/agenda/registrar-sesion] fallo", { message: error?.message })
    return Response.json({ error: "error_interno" }, { status: 500, headers: CABECERAS_SIN_CACHE })
  }
}

export async function GET(req: Request) {
  if (!secretoAgendaValido(req)) return respuestaNoAutorizada()

  const admin = createAdminClient()
  if (!admin) {
    return Response.json({ error: "servidor_no_configurado" }, { status: 500, headers: CABECERAS_SIN_CACHE })
  }

  const eventos = (new URL(req.url).searchParams.get("eventos") || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)

  try {
    const registrados = await eventosYaEnElErp(admin, eventos)
    return Response.json({ registrados }, { headers: CABECERAS_SIN_CACHE })
  } catch (error: any) {
    console.error("[integraciones/agenda/registrar-sesion] fallo GET", { message: error?.message })
    return Response.json({ error: "error_interno" }, { status: 500, headers: CABECERAS_SIN_CACHE })
  }
}
