import { NextResponse } from "next/server"
import { AuthzError, requireRoles } from "@/lib/utils/authz"
import { createAdminClient } from "@/lib/supabase/admin"
import { getTelegramCajeroConfig } from "@/lib/telegram-cajero/config"
import { planWithAi } from "@/lib/telegram-cajero/ai-planner"
import { executeAiToolPlan } from "@/lib/telegram-cajero/tool-executor"
import { writeAiResponse } from "@/lib/telegram-cajero/ai-response-writer"

export const dynamic = "force-dynamic"

// QA solo-lectura del bot cajero SIN tocar Telegram: corre el cerebro real
// (planner V4 Pro -> tools -> redactor) y devuelve la respuesta que daria el bot.
// No envia nada al grupo. Acceso: admin autenticado o header x-cajero-test-secret
// igual a TELEGRAM_WEBHOOK_SECRET (mismo secreto que ya protege el webhook).

async function authorize(request: Request) {
  const secret = request.headers.get("x-cajero-test-secret")?.trim()
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (secret && expected && secret === expected) return
  await requireRoles(["admin"])
}

async function ejecutar(pregunta: string, state: any) {
  const config = getTelegramCajeroConfig()
  if (!config) return { error: "Bot no configurado (faltan TELEGRAM_BOT_TOKEN/WEBHOOK_SECRET)." }

  const plan = await planWithAi(pregunta, config, state || {})

  if (plan.mode === "clarify" && plan.clarification) {
    return { mode: plan.mode, intent: plan.intent, tools: [], respuesta: plan.clarification }
  }

  if (plan.mode === "answer_from_memory") {
    const respuesta = await writeAiResponse({
      text: pregunta,
      plan,
      bundle: { status: "empty", results: [], pendingSelection: null, structuredResults: [], userSafeErrors: [] },
      state: state || {},
      config,
    })
    return { mode: plan.mode, intent: plan.intent, tools: [], respuesta }
  }

  if (plan.mode === "tool_plan" && plan.tools.length) {
    const supabase = createAdminClient()
    if (!supabase) return { error: "Sin SUPABASE_SERVICE_ROLE_KEY." }
    const bundle = await executeAiToolPlan(supabase, plan)
    const respuesta = await writeAiResponse({ text: pregunta, plan, bundle, state: state || {}, config })

    // Estado de seguimiento para encadenar (probar contexto: "y cuanto debe").
    const nuevoState: any = { ...(state || {}), lastIntent: plan.intent }
    if (bundle.structuredResults.length) {
      const ultimo = bundle.structuredResults[bundle.structuredResults.length - 1]
      nuevoState.lastStructuredResult = ultimo
      if (ultimo?.asistente) nuevoState.lastAsistente = ultimo.asistente
    }
    return {
      mode: plan.mode,
      intent: plan.intent,
      tools: plan.tools.map((tool) => tool.name),
      pendingSelection: bundle.pendingSelection || null,
      respuesta,
      state: nuevoState,
    }
  }

  return {
    mode: plan.mode,
    intent: plan.intent,
    tools: [],
    respuesta: "(la IA no produjo un plan accionable; en el bot real caeria al respaldo deterministico)",
  }
}

export async function GET(request: Request) {
  try {
    await authorize(request)
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthzError ? error.message : "No autorizado" }, { status: 403 })
  }
  const pregunta = new URL(request.url).searchParams.get("q")?.trim() || ""
  if (!pregunta) return NextResponse.json({ error: "Falta ?q=<pregunta>" }, { status: 400 })
  return NextResponse.json(await ejecutar(pregunta, {}))
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
  return NextResponse.json(await ejecutar(pregunta, body.state || {}))
}
