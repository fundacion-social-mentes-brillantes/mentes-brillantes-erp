import { createAdminClient } from "@/lib/supabase/admin"
import {
  CABECERAS_SIN_CACHE,
  inscribirDesdeInvitacion,
  respuestaNoAutorizada,
  secretoTalleresValido,
} from "@/lib/integraciones/talleres-publico"
import { OperacionError } from "@/lib/operaciones/errores"
import { mensajeDeError } from "@/lib/utils/errores"

// POST: inscribe a una persona desde la invitacion. No crea asistentes del
// ERP ni registra pagos: devuelve el codigo de su boleta y como pagar.

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!secretoTalleresValido(req)) return respuestaNoAutorizada()
  const admin = createAdminClient()
  if (!admin) return Response.json({ error: "servidor_no_configurado" }, { status: 500, headers: CABECERAS_SIN_CACHE })

  try {
    const { slug } = await params
    const cuerpo = await req.json().catch(() => ({}))
    const resultado = await inscribirDesdeInvitacion(admin, slug, cuerpo)
    return Response.json(resultado, { status: 201, headers: CABECERAS_SIN_CACHE })
  } catch (error) {
    if (error instanceof OperacionError) {
      return Response.json({ error: "operacion_invalida", mensaje: error.message }, { status: 400, headers: CABECERAS_SIN_CACHE })
    }
    console.error("[integraciones/talleres/inscripciones] fallo", { message: mensajeDeError(error, "desconocido") })
    return Response.json({ error: "error_interno" }, { status: 500, headers: CABECERAS_SIN_CACHE })
  }
}
