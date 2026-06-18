import { NextResponse } from "next/server"
import { AuthzError, requireRoles } from "@/lib/utils/authz"
import { ejecutarConsultaCajero } from "@/lib/telegram-cajero/qa-runner"

export const dynamic = "force-dynamic"

// QA solo-lectura del bot cajero SIN tocar Telegram: corre el cerebro real
// (planner V4 Pro -> tools -> redactor) y devuelve la respuesta que daria.
// Solo-admin (sesion). Util para validar respuestas desde el navegador.

export async function GET(request: Request) {
  try {
    await requireRoles(["admin"])
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthzError ? error.message : "No autorizado" }, { status: 403 })
  }
  const pregunta = new URL(request.url).searchParams.get("q")?.trim() || ""
  if (!pregunta) return NextResponse.json({ error: "Falta ?q=<pregunta>" }, { status: 400 })
  return NextResponse.json(await ejecutarConsultaCajero(pregunta, {}))
}

export async function POST(request: Request) {
  try {
    await requireRoles(["admin"])
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthzError ? error.message : "No autorizado" }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const pregunta = typeof body.pregunta === "string" ? body.pregunta.trim() : ""
  if (!pregunta) return NextResponse.json({ error: "Falta 'pregunta'" }, { status: 400 })
  return NextResponse.json(await ejecutarConsultaCajero(pregunta, body.state || {}))
}
