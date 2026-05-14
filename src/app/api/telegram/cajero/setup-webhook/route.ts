import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

const WEBHOOK_URL = "https://mentes-brillantes-erp.vercel.app/api/telegram/cajero"

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function hasSetupPermission(request: Request, webhookSecret: string) {
  const headerSecret = request.headers.get("x-telegram-admin-secret")?.trim() || ""
  const bearerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || ""
  return safeEqual(headerSecret || bearerSecret, webhookSecret)
}

export async function GET() {
  return NextResponse.json({ ok: false }, { status: 405 })
}

export async function POST(request: Request) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  if (!webhookSecret || !hasSetupPermission(request, webhookSecret)) {
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
