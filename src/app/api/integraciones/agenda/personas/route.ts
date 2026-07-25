import { timingSafeEqual } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPersonFinancialStatus, type SupabaseReader } from "@/lib/telegram-cajero/tools"
import { getCoachSessions } from "@/lib/telegram-cajero/tools/coach"

// Estado real de una o varias personas para la AGENDA (agenda-mentes-brillantes).
//
// La agenda ya comparte los codigos de persona con el ERP, pero no sabia nada
// del dinero: mostraba importes que se escribian a mano. Este endpoint le
// entrega la verdad del ERP (deuda, saldo a favor y sesiones coach) para que
// no haya dos contabilidades.
//
// SOLO LECTURA y sin datos sensibles: no devuelve cedulas, correos, telefonos
// ni notas del coach. Se protege con un secreto compartido, no con OAuth,
// porque quien llama es el servidor de la agenda, no una persona.

export const dynamic = "force-dynamic"

const MAX_CODIGOS = 50

function secretoValido(req: Request): boolean {
  const esperado = process.env.AGENDA_SHARED_SECRET
  if (!esperado) return false

  const recibido = req.headers.get("x-agenda-secret") || ""
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  // Longitudes distintas: timingSafeEqual lanzaria, asi que se compara aparte.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function noAutorizado() {
  return Response.json({ error: "no_autorizado" }, { status: 401, headers: { "Cache-Control": "no-store" } })
}

async function estadoDeCodigo(supabase: SupabaseReader, admin: any, codigo: string) {
  const { data: persona, error } = await admin
    .from("asistentes")
    .select("id, nombre, codigo, activo")
    .eq("codigo", codigo)
    .maybeSingle()

  if (error) throw new Error("No se pudo consultar la persona.")
  if (!persona) return { codigo, existe: false as const }

  const [financiero, coach]: any[] = await Promise.all([
    getPersonFinancialStatus(supabase, persona.id),
    getCoachSessions(supabase, persona.id),
  ])

  const f = financiero?.data || {}
  const c = coach?.data || {}

  return {
    codigo,
    existe: true as const,
    nombre: persona.nombre,
    activo: persona.activo,
    // Cifras globales; null cuando la lectura quedo incompleta, para que la
    // agenda no muestre un numero a medias como si fuera definitivo.
    deuda_total: f.total_pendiente ?? null,
    total_facturado: f.total_facturado ?? null,
    total_abonado: f.total_abonado ?? null,
    saldo_a_favor: f.saldo_a_favor ?? null,
    cuentas_pendientes: Array.isArray(f.cuentas)
      ? f.cuentas.filter((x: any) => Number(x.pendiente) > 0).length
      : null,
    coach: {
      sesiones_compradas: c.sesiones_compradas ?? 0,
      sesiones_realizadas: c.sesiones_realizadas ?? 0,
      sesiones_restantes: c.sesiones_restantes ?? 0,
      // Sesiones que vienen de la migracion y no estan en el modulo nuevo.
      sesiones_migradas: c.sesiones_migradas ?? 0,
      sesiones_tomadas_total: c.sesiones_tomadas_total ?? c.sesiones_realizadas ?? 0,
    },
    completo: financiero?.data?.pagination?.complete !== false,
  }
}

export async function GET(req: Request) {
  if (!secretoValido(req)) return noAutorizado()

  const url = new URL(req.url)
  const crudos = (url.searchParams.get("codigos") || url.searchParams.get("codigo") || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)

  const codigos = Array.from(new Set(crudos)).slice(0, MAX_CODIGOS)
  if (!codigos.length) {
    return Response.json(
      { error: "faltan_codigos", detalle: "Usa ?codigos=5,9,211 o ?codigo=5" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  }

  const admin = createAdminClient()
  if (!admin) {
    return Response.json({ error: "servidor_no_configurado" }, { status: 500, headers: { "Cache-Control": "no-store" } })
  }
  const supabase = admin as unknown as SupabaseReader

  try {
    const personas = await Promise.all(codigos.map((c) => estadoDeCodigo(supabase, admin, c)))
    return Response.json(
      { consultadas: personas.length, asOf: new Date().toISOString(), personas },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error: any) {
    console.error("[integraciones/agenda] fallo", { message: error?.message })
    return Response.json({ error: "error_interno" }, { status: 500, headers: { "Cache-Control": "no-store" } })
  }
}
