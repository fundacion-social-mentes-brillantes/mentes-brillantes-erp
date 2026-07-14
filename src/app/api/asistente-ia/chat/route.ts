import { NextResponse } from "next/server"
import {
  type AsistenteIaOption,
  buildAsistenteIaContext,
  buildAsistenteIaContextByCodigo,
  buildAsistenteIaContextById,
} from "@/lib/asistente-ia/context"
import { buildContabilidadContext, shouldUseContabilidadContext } from "@/lib/asistente-ia/contabilidad"
import { buildConceptBuyersContext, detectConceptBuyers } from "@/lib/asistente-ia/concept-buyers"
import { AuthzError, requireRoles } from "@/lib/utils/authz"

const SYSTEM_PROMPT =
  "Eres el asistente interno de solo lectura del ERP de Gimnasio Emocional Mentes Brillantes. Respondes únicamente con los datos proporcionados por el sistema. No inventes pagos, saldos, cuentas, nombres ni fechas. No puedes crear, editar, eliminar, registrar pagos ni modificar información. Si la información no está disponible, dilo claramente. Usa pesos colombianos COP y lenguaje natural. Si el contexto trae error de consulta, informa que no se pudo consultar la información y no des cifras en cero. Para sesiones coach: cuenta las sesiones del módulo (coach_sesiones) y ADEMÁS las que vienen de la migración (sesiones_migradas: cuentas de 'sesión coach' no conectadas al contador); esas cuentas migradas SÍ son sesiones tomadas. Si la persona no tiene módulo pero sí cuentas migradas de sesión coach, di cuántas sesiones tomó y enumera sus fechas (la fecha de cada cuenta); no digas que no tiene sesiones. Aclara brevemente cuando el conteo viene de registros migrados. Para análisis contable, distingue ingresos de cartera, donaciones, ventas externas, ingresos operativos, egresos operativos, adelantos no operativos y utilidad."

type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
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

function sanitizeSelectionOptions(value: unknown): AsistenteIaOption[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((option): option is AsistenteIaOption => {
      if (!option || typeof option !== "object") return false
      const candidate = option as AsistenteIaOption
      return typeof candidate.id === "string" && typeof candidate.nombre === "string"
    })
    .slice(0, 5)
    .map((option) => ({
      id: option.id,
      nombre: option.nombre,
      codigo: option.codigo ?? null,
      cedula: option.cedula ?? null,
    }))
}

function lastUserMessage(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return messages[index].content.trim()
  }
  return ""
}

function firstUserMessage(messages: ChatMessage[]) {
  return messages.find((message) => message.role === "user")?.content.trim() || ""
}

function parseOptionNumber(message: string) {
  const normalized = normalizeText(message).trim()
  const match = normalized.match(/^(?:opcion|la|el|numero|num|nro)?\s*(\d{1,2})$/)
  if (!match) return null

  const number = Number(match[1])
  return Number.isInteger(number) ? number : null
}

function parseCodigo(message: string) {
  const normalized = normalizeText(message).trim()
  const explicit = normalized.match(/^(?:codigo|cod)\s+([a-z0-9-]+)$/)
  if (explicit) return explicit[1]

  if (/^[a-z0-9-]{2,}$/.test(normalized)) return normalized
  return null
}

function extractSelectionOptions(context: any): AsistenteIaOption[] {
  if (!context?.requiere_seleccion || !Array.isArray(context.coincidencias)) return []

  return context.coincidencias
    .map((coincidencia: any) => coincidencia?.asistente)
    .filter((asistente: any): asistente is AsistenteIaOption => {
      return asistente && typeof asistente.id === "string" && typeof asistente.nombre === "string"
    })
    .slice(0, 5)
    .map((asistente: any) => ({
      id: asistente.id,
      nombre: asistente.nombre,
      codigo: asistente.codigo ?? null,
      cedula: asistente.cedula ?? null,
    }))
}

function conversationTitle(question: string) {
  const clean = question.replace(/\s+/g, " ").trim()
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean || "Nuevo chat"
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireRoles(["admin", "caja"])
    const body = await request.json().catch(() => ({}))
    const messages = sanitizeMessages(body.messages)
    const selectionOptions = sanitizeSelectionOptions(body.selectionOptions)
    const fallbackMessage = typeof body.message === "string" ? body.message.trim() : ""
    const question = lastUserMessage(messages) || fallbackMessage

    if (!question) {
      return NextResponse.json({ error: "Escribe una pregunta." }, { status: 400 })
    }

    let conversationId = typeof body.conversationId === "string" ? body.conversationId : null
    if (!conversationId) {
      const { data: conversation, error: conversationError } = await supabase
        .from("asistente_ia_conversaciones")
        .insert({ usuario_id: user.id, titulo: conversationTitle(question) })
        .select("id")
        .single()

      if (conversationError) {
        console.error("[asistente-ia] error creando conversacion", conversationError)
        return NextResponse.json({ error: "No se pudo guardar el chat." }, { status: 500 })
      }
      conversationId = conversation.id
    }

    const { error: userMessageError } = await supabase.from("asistente_ia_mensajes").insert({
      conversacion_id: conversationId,
      rol: "user",
      contenido: question,
    })
    if (userMessageError) {
      console.error("[asistente-ia] error guardando pregunta", userMessageError)
      return NextResponse.json({ error: "No se pudo guardar la pregunta." }, { status: 500 })
    }

    const apiKey = process.env.DEEPSEEK_API_KEY
    const model = process.env.DEEPSEEK_MODEL
    const baseUrl = process.env.DEEPSEEK_BASE_URL?.replace(/\/+$/, "")

    if (!apiKey || !model || !baseUrl) {
      return NextResponse.json({ error: "DeepSeek no está configurado en el servidor." }, { status: 500 })
    }

    const optionNumber = parseOptionNumber(question)
    const selectedByNumber =
      optionNumber && optionNumber >= 1 && optionNumber <= selectionOptions.length
        ? selectionOptions[optionNumber - 1]
        : null
    const codigo = parseCodigo(question)
    const selectedByCodigo = codigo
      ? selectionOptions.find((option) => normalizeText(String(option.codigo || "")) === codigo)
      : null

    const conceptBuyersTerm = !selectedByNumber && !selectedByCodigo && !codigo ? detectConceptBuyers(question) : null

    const safeContext = selectedByNumber
      ? await buildAsistenteIaContextById(supabase, selectedByNumber.id, question)
      : selectedByCodigo
        ? await buildAsistenteIaContextById(supabase, selectedByCodigo.id, question)
        : codigo
          ? await buildAsistenteIaContextByCodigo(supabase, codigo, question)
          : conceptBuyersTerm
            ? await buildConceptBuyersContext(supabase, question, conceptBuyersTerm)
            : shouldUseContabilidadContext(question)
              ? await buildContabilidadContext(supabase, question)
              : await buildAsistenteIaContext(supabase, question)
    const nextSelectionOptions = extractSelectionOptions(safeContext)

    const requestBody = JSON.stringify({
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
    })

    // Resiliencia: timeout de 30s y un reintento ante fallo de red, con mensaje
    // de degradacion claro en vez de un error seco, para que no se perciba "roto".
    const callDeepSeek = async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30000)
      try {
        return await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: requestBody,
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }
    }

    let response: Response | null = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await callDeepSeek()
        break
      } catch {
        if (attempt === 1) {
          console.error("[asistente-ia] DeepSeek no respondio")
          return NextResponse.json(
            { error: "El asistente IA no está disponible en este momento. Intenta de nuevo en unos segundos." },
            { status: 503 }
          )
        }
      }
    }

    if (!response || !response.ok) {
      return NextResponse.json(
        { error: "No se pudo obtener respuesta del asistente IA. Intenta de nuevo en unos segundos." },
        { status: 502 }
      )
    }

    const data = await response.json()
    const answer = data?.choices?.[0]?.message?.content

    if (typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json({ error: "El asistente IA no devolvió una respuesta válida." }, { status: 502 })
    }

    const [{ error: assistantMessageError }, { error: updateConversationError }] = await Promise.all([
      supabase.from("asistente_ia_mensajes").insert({
        conversacion_id: conversationId,
        rol: "assistant",
        contenido: answer,
      }),
      supabase
        .from("asistente_ia_conversaciones")
        .update({ actualizado_en: new Date().toISOString(), titulo: conversationTitle(firstUserMessage(messages) || question) })
        .eq("id", conversationId)
        .eq("usuario_id", user.id),
    ])

    if (assistantMessageError || updateConversationError) {
      console.error("[asistente-ia] error guardando respuesta", {
        assistantMessageError,
        updateConversationError,
      })
      return NextResponse.json({ error: "No se pudo guardar la respuesta." }, { status: 500 })
    }

    return NextResponse.json({ answer, selectionOptions: nextSelectionOptions, conversationId })
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    console.error("[asistente-ia]", error)
    return NextResponse.json({ error: "Error interno del asistente IA." }, { status: 500 })
  }
}
