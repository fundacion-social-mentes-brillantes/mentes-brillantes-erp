import { createAdminClient } from "@/lib/supabase/admin"
import { getTelegramCajeroConfig } from "@/lib/telegram-cajero/config"
import { sendTelegramMessage } from "@/lib/telegram-cajero/telegram"
import { calcularDiferencias, resumenEspejoAgenda } from "@/lib/operaciones/agenda-sync"
import { armarMensaje } from "@/lib/operaciones/agenda-resumen-mensaje"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import { mensajeDeError } from "@/lib/utils/errores"
import { secretoCoincide, tokenBearer } from "@/lib/seguridad/secretos"

// Resumen diario de diferencias entre la agenda y el ERP, por Telegram.
//
// Solo AVISA: no registra nada. Si no hay nada que revisar, no escribe, para
// que el aviso siga significando algo cuando llegue.

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Vercel manda "Authorization: Bearer <CRON_SECRET>" en cada cron. Antes
 * tambien bastaba el encabezado x-vercel-cron, que cualquiera puede escribir
 * en una peticion: con eso se podia disparar el aviso de Telegram a voluntad.
 */
function llamadaAutorizada(req: Request): boolean {
  return secretoCoincide(tokenBearer(req), process.env.CRON_SECRET)
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
    const [diferencias, espejo] = await Promise.all([
      calcularDiferencias(admin, ventana),
      resumenEspejoAgenda(admin, ventana),
    ])

    // Callarse solo se vale cuando el silencio de verdad significa "todo al
    // dia". Si la agenda dejo de reportar, no hay diferencias porque no hay
    // datos, y eso hay que decirlo.
    if (!diferencias.length && !espejo.aviso) {
      return Response.json({ enviado: false, motivo: "sin_diferencias", ventana })
    }

    await sendTelegramMessage(
      config,
      Number(config.allowedChatId),
      armarMensaje(diferencias, ventana, espejo.aviso)
    )
    return Response.json({
      enviado: true,
      diferencias: diferencias.length,
      aviso: espejo.aviso ?? null,
      ventana,
    })
  } catch (error) {
    console.error("[cron/resumen-agenda] fallo", { message: mensajeDeError(error) })
    return Response.json({ error: "error_interno" }, { status: 500 })
  }
}
