import { createAdminClient } from "@/lib/supabase/admin"
import { getTelegramCajeroConfig } from "@/lib/telegram-cajero/config"
import { sendTelegramMessage } from "@/lib/telegram-cajero/telegram"
import { calcularDiferencias, type Diferencia } from "@/lib/operaciones/agenda-sync"

// Resumen diario de diferencias entre la agenda y el ERP, por Telegram.
//
// Solo AVISA: no registra nada. Si no hay nada que revisar, no escribe, para
// que el aviso siga significando algo cuando llegue.

export const dynamic = "force-dynamic"
export const maxDuration = 60

const TITULOS: Record<Diferencia["tipo"], string> = {
  evento_borrado_con_sesion: "Se borró de la agenda algo ya cobrado",
  sesion_sin_registrar: "Sesiones dictadas sin registrar",
  fecha_movida: "Sesiones que cambiaron de fecha",
  persona_nueva: "Personas de la agenda que no están en el ERP",
}

/** Vercel firma sus crons con este encabezado; tambien se acepta CRON_SECRET. */
function llamadaAutorizada(req: Request): boolean {
  const secreto = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (secreto && auth === `Bearer ${secreto}`) return true
  // Vercel Cron añade este encabezado en produccion.
  return req.headers.get("x-vercel-cron") !== null
}

function armarMensaje(diferencias: Diferencia[], ventana: { desde: string; hasta: string }): string {
  const porTipo = new Map<Diferencia["tipo"], Diferencia[]>()
  for (const d of diferencias) {
    const lista = porTipo.get(d.tipo) || []
    lista.push(d)
    porTipo.set(d.tipo, lista)
  }

  const partes: string[] = [
    `Agenda vs ERP — ${diferencias.length} cosa(s) por revisar`,
    `(del ${ventana.desde} al ${ventana.hasta})`,
    "",
  ]

  // El orden de calcularDiferencias ya pone primero lo mas delicado.
  for (const [tipo, lista] of Array.from(porTipo.entries())) {
    partes.push(`▸ ${TITULOS[tipo]} (${lista.length})`)
    for (const d of lista.slice(0, 8)) {
      partes.push(`   · ${d.mensaje}`)
    }
    if (lista.length > 8) partes.push(`   · …y ${lista.length - 8} más`)
    partes.push("")
  }

  partes.push("Nada se registra solo. Dime cuáles apruebas.")
  return partes.join("\n")
}

export async function GET(req: Request) {
  if (!llamadaAutorizada(req)) {
    return Response.json({ error: "no_autorizado" }, { status: 401 })
  }

  const admin = createAdminClient()
  const config = getTelegramCajeroConfig()
  if (!admin || !config?.allowedChatId) {
    return Response.json({ error: "no_configurado" }, { status: 503 })
  }

  const hoy = new Date()
  const fecha = (dias: number) => new Date(hoy.getTime() + dias * 86400000).toISOString().slice(0, 10)
  const ventana = { desde: fecha(-45), hasta: fecha(15) }

  try {
    const diferencias = await calcularDiferencias(admin, ventana)

    if (!diferencias.length) {
      return Response.json({ enviado: false, motivo: "sin_diferencias", ventana })
    }

    await sendTelegramMessage(config, Number(config.allowedChatId), armarMensaje(diferencias, ventana))
    return Response.json({ enviado: true, diferencias: diferencias.length, ventana })
  } catch (error: any) {
    console.error("[cron/resumen-agenda] fallo", { message: error?.message })
    return Response.json({ error: "error_interno" }, { status: 500 })
  }
}
