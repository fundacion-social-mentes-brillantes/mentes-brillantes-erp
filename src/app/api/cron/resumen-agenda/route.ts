import { createAdminClient } from "@/lib/supabase/admin"
import { getTelegramCajeroConfig } from "@/lib/telegram-cajero/config"
import { sendTelegramMessage } from "@/lib/telegram-cajero/telegram"
import { calcularDiferencias } from "@/lib/operaciones/agenda-sync"
import { armarMensaje } from "@/lib/operaciones/agenda-resumen-mensaje"
import { fechaHoyBogota } from "@/lib/utils/fechas"

// Resumen diario de diferencias entre la agenda y el ERP, por Telegram.
//
// Solo AVISA: no registra nada. Si no hay nada que revisar, no escribe, para
// que el aviso siga significando algo cuando llegue.

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Vercel firma sus crons con este encabezado; tambien se acepta CRON_SECRET. */
function llamadaAutorizada(req: Request): boolean {
  const secreto = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (secreto && auth === `Bearer ${secreto}`) return true
  // Vercel Cron añade este encabezado en produccion.
  return req.headers.get("x-vercel-cron") !== null
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

  // La ventana se cuenta desde el dia colombiano, no el del servidor (UTC).
  const hoy = fechaHoyBogota()
  const fecha = (dias: number) =>
    new Date(new Date(`${hoy}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10)
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
