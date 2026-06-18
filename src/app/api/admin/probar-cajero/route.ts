import { NextResponse } from "next/server"
import { AuthzError, requireRoles } from "@/lib/utils/authz"
import { ejecutarConsultaCajero } from "@/lib/telegram-cajero/qa-runner"

export const dynamic = "force-dynamic"

// QA solo-lectura del bot cajero SIN tocar Telegram: corre el cerebro real
// (planner V4 Pro -> tools -> redactor) y devuelve la respuesta que daria.
// Acceso: admin autenticado (uso desde el navegador) o header
// x-cajero-test-secret == CAJERO_TEST_SECRET / TELEGRAM_WEBHOOK_SECRET.

async function authorize(request: Request) {
  const secret = request.headers.get("x-cajero-test-secret")?.trim()
  const expected = [process.env.CAJERO_TEST_SECRET, process.env.TELEGRAM_WEBHOOK_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
  if (secret && expected.includes(secret)) return
  await requireRoles(["admin"])
}

export async function GET(request: Request) {
  try {
    await authorize(request)
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthzError ? error.message : "No autorizado" }, { status: 403 })
  }
  const pregunta = new URL(request.url).searchParams.get("q")?.trim() || ""
  if (!pregunta) return NextResponse.json({ error: "Falta ?q=<pregunta>" }, { status: 400 })
  return NextResponse.json(await ejecutarConsultaCajero(pregunta, {}))
}

export async function POST(request: Request) {
  try {
    await authorize(request)
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthzError ? error.message : "No autorizado" }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const pregunta = typeof body.pregunta === "string" ? body.pregunta.trim() : ""
  if (!pregunta) return NextResponse.json({ error: "Falta 'pregunta'" }, { status: 400 })
  return NextResponse.json(await ejecutarConsultaCajero(pregunta, body.state || {}))
}
