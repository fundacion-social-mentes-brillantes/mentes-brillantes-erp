import { NextResponse } from "next/server"
import { ejecutarConsultaCajero } from "@/lib/telegram-cajero/qa-runner"

export const dynamic = "force-dynamic"

// QA del bot cajero bajo el prefijo /api/telegram (excluido del middleware de
// sesion), protegido OBLIGATORIAMENTE por CAJERO_TEST_SECRET. Solo lectura, no
// envia nada a Telegram. Sirve para validar el pipeline conversacional end-to-end.
function authorized(request: Request) {
  const expected = process.env.CAJERO_TEST_SECRET?.trim()
  if (!expected) return false
  const secret = request.headers.get("x-cajero-test-secret")?.trim()
  return Boolean(secret && secret === expected)
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const pregunta = new URL(request.url).searchParams.get("q")?.trim() || ""
  if (!pregunta) return NextResponse.json({ error: "Falta ?q=<pregunta>" }, { status: 400 })
  return NextResponse.json(await ejecutarConsultaCajero(pregunta, {}))
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const pregunta = typeof body.pregunta === "string" ? body.pregunta.trim() : ""
  if (!pregunta) return NextResponse.json({ error: "Falta 'pregunta'" }, { status: 400 })
  return NextResponse.json(await ejecutarConsultaCajero(pregunta, body.state || {}))
}
