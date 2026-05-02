import { NextResponse } from "next/server"

const WEBHOOK_URL = "https://mentes-brillantes-erp.vercel.app/api/telegram/cajero"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const adminSecret = searchParams.get("admin_secret")
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  if (!webhookSecret || adminSecret !== webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  if (!botToken) {
    return NextResponse.json({ ok: false, description: "Telegram bot token no configurado" }, { status: 500 })
  }

  const telegramUrl = `https://api.telegram.org/bot${botToken}/setWebhook`
  const response = await fetch(telegramUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      secret_token: webhookSecret,
    }),
  })

  const data = await response.json().catch(() => ({
    ok: false,
    description: "Telegram no devolvio JSON valido",
  }))

  return NextResponse.json(data, { status: response.ok ? 200 : 502 })
}
