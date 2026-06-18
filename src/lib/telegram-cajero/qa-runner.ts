import { createAdminClient } from "@/lib/supabase/admin"
import { getTelegramCajeroConfig } from "./config"
import { planWithAi } from "./ai-planner"
import { executeAiToolPlan } from "./tool-executor"
import { writeAiResponse } from "./ai-response-writer"

// Corre el cerebro real del bot cajero (planner V4 Pro -> tools -> redactor) y
// devuelve la respuesta que daria, SIN tocar Telegram. Solo lectura. Compartido
// por los endpoints de QA (probar-cajero y el de diagnostico bajo /api/telegram).
export async function ejecutarConsultaCajero(pregunta: string, state: any) {
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
