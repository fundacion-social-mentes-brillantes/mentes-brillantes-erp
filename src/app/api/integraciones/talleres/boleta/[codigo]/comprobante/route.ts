import { createAdminClient } from "@/lib/supabase/admin"
import {
  CABECERAS_SIN_CACHE,
  guardarComprobante,
  respuestaNoAutorizada,
  secretoTalleresValido,
  TAMANO_MAXIMO_COMPROBANTE,
} from "@/lib/integraciones/talleres-publico"
import { OperacionError } from "@/lib/operaciones/errores"
import { mensajeDeError } from "@/lib/utils/errores"

// POST (multipart, campo "archivo"): guarda la foto o el PDF del comprobante de
// pago. Queda para que el equipo lo revise; no marca nada como pagado.

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  if (!secretoTalleresValido(req)) return respuestaNoAutorizada()
  const admin = createAdminClient()
  if (!admin) return Response.json({ error: "servidor_no_configurado" }, { status: 500, headers: CABECERAS_SIN_CACHE })

  const largo = Number(req.headers.get("content-length") || 0)
  if (largo > TAMANO_MAXIMO_COMPROBANTE + 64 * 1024) {
    return Response.json({ error: "operacion_invalida", mensaje: "El archivo es muy pesado: máximo 5 MB." }, { status: 413, headers: CABECERAS_SIN_CACHE })
  }

  try {
    const { codigo } = await params
    const formulario = await req.formData().catch(() => null)
    const archivo = formulario?.get("archivo")
    if (!(archivo instanceof File)) {
      return Response.json({ error: "operacion_invalida", mensaje: "Falta el archivo del comprobante." }, { status: 400, headers: CABECERAS_SIN_CACHE })
    }
    const resultado = await guardarComprobante(admin, codigo, archivo)
    return Response.json(resultado, { headers: CABECERAS_SIN_CACHE })
  } catch (error) {
    if (error instanceof OperacionError) {
      return Response.json({ error: "operacion_invalida", mensaje: error.message }, { status: 400, headers: CABECERAS_SIN_CACHE })
    }
    console.error("[integraciones/talleres/comprobante] fallo", { message: mensajeDeError(error, "desconocido") })
    return Response.json({ error: "error_interno" }, { status: 500, headers: CABECERAS_SIN_CACHE })
  }
}
