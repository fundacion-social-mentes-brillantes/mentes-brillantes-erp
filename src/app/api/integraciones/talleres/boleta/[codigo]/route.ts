import { createAdminClient } from "@/lib/supabase/admin"
import { boletaPorCodigo, CABECERAS_SIN_CACHE, respuestaNoAutorizada, secretoTalleresValido } from "@/lib/integraciones/talleres-publico"
import { mensajeDeError } from "@/lib/utils/errores"

// GET: la boleta de una persona (su taller, su nombre y como va su pago).

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  if (!secretoTalleresValido(req)) return respuestaNoAutorizada()
  const admin = createAdminClient()
  if (!admin) return Response.json({ error: "servidor_no_configurado" }, { status: 500, headers: CABECERAS_SIN_CACHE })

  try {
    const { codigo } = await params
    const boleta = await boletaPorCodigo(admin, codigo)
    if (!boleta) return Response.json({ error: "no_existe" }, { status: 404, headers: CABECERAS_SIN_CACHE })
    return Response.json({ boleta }, { headers: CABECERAS_SIN_CACHE })
  } catch (error) {
    console.error("[integraciones/talleres/boleta] fallo", { message: mensajeDeError(error, "desconocido") })
    return Response.json({ error: "error_interno" }, { status: 500, headers: CABECERAS_SIN_CACHE })
  }
}
