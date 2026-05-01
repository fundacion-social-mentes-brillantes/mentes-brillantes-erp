import { NextResponse } from "next/server"
import { buildAsistenteIaContext } from "@/lib/asistente-ia/context"
import { AuthzError, requireRoles } from "@/lib/utils/authz"

const SYSTEM_PROMPT =
  "Eres el asistente interno de solo lectura del ERP de Gimnasio Emocional Mentes Brillantes. Respondes únicamente con los datos proporcionados por el sistema. No inventes pagos, saldos, cuentas, nombres ni fechas. No puedes crear, editar, eliminar, registrar pagos ni modificar información. Si la información no está disponible, dilo claramente. Usa pesos colombianos COP y lenguaje natural."

type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

function sanitizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((message): message is ChatMessage => {
      if (!message || typeof message !== "object") return false
      const candidate = message as ChatMessage
      return (
        (candidate.role === "user" || candidate.role === "assistant") &&
        typeof candidate.content === "string" &&
        candidate.content.trim().length > 0
      )
    })
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 2000),
    }))
}

function lastUserMessage(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return messages[index].content.trim()
  }
  return ""
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireRoles(["admin", "caja"])
    const body = await request.json().catch(() => ({}))
    const messages = sanitizeMessages(body.messages)
    const fallbackMessage = typeof body.message === "string" ? body.message.trim() : ""
    const question = lastUserMessage(messages) || fallbackMessage

    if (!question) {
      return NextResponse.json({ error: "Escribe una pregunta." }, { status: 400 })
    }

    const apiKey = process.env.DEEPSEEK_API_KEY
    const model = process.env.DEEPSEEK_MODEL
    const baseUrl = process.env.DEEPSEEK_BASE_URL?.replace(/\/+$/, "")

    if (!apiKey || !model || !baseUrl) {
      return NextResponse.json({ error: "DeepSeek no está configurado en el servidor." }, { status: 500 })
    }

    const safeContext = await buildAsistenteIaContext(supabase, question)

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "system",
            content: `Datos internos seguros de solo lectura. Responde solo con esta informacion y no propongas acciones de escritura:\n${JSON.stringify(
              safeContext,
              null,
              2
            )}`,
          },
          ...messages,
        ],
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: "No se pudo obtener respuesta del asistente IA." }, { status: 502 })
    }

    const data = await response.json()
    const answer = data?.choices?.[0]?.message?.content

    if (typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json({ error: "El asistente IA no devolvió una respuesta válida." }, { status: 502 })
    }

    return NextResponse.json({ answer })
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    console.error("[asistente-ia]", error)
    return NextResponse.json({ error: "Error interno del asistente IA." }, { status: 500 })
  }
}
