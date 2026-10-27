import { createAdminClient } from "@/lib/supabase/admin"
import { CABECERAS_SIN_CACHE, respuestaNoAutorizada, secretoTalleresValido, tallerPublico } from "@/lib/integraciones/talleres-publico"
import { mensajeDeError } from "@/lib/utils/errores"

// GET: el taller como lo muestra la invitacion (con ?vista_previa=1 tambien
// los borradores, para revisar la invitacion antes de abrirla).

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!secretoTalleresValido(req)) return respuestaNoAutorizada()
  const admin = createAdminClient()
  if (!admin) return Response.json({ error: "servidor_no_configurado" }, { status: 500, headers: CABECERAS_SIN_CACHE })

  try {
    const { slug } = await params
    const vistaPrevia = new URL(req.url).searchParams.get("vista_previa") === "1"
    const taller = await tallerPublico(admin, slug, { vistaPrevia })
    if (!taller) return Response.json({ error: "no_existe" }, { status: 404, headers: CABECERAS_SIN_CACHE })
    return Response.json({ taller }, { headers: CABECERAS_SIN_CACHE })
  } catch (error) {
    console.error("[integraciones/talleres/taller] fallo", { message: mensajeDeError(error, "desconocido") })
    return Response.json({ error: "error_interno" }, { status: 500, headers: CABECERAS_SIN_CACHE })
  }
}
