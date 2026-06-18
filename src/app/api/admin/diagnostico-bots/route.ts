import { NextResponse } from "next/server"
import { AuthzError, requireRoles } from "@/lib/utils/authz"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// Diagnostico SOLO-ADMIN de los dos bots de IA. Reporta PRESENCIA de variables
// de entorno (nunca sus valores), si la tabla de sesiones existe y el estado del
// webhook de Telegram. Sirve para ver, sin exponer secretos, que falta en
// produccion cuando un bot deja de responder.

const present = (v?: string | null) => Boolean(v && v.trim())

// Prueba en vivo el endpoint de DeepSeek (opcional, con ?ping=1). Reporta el
// estado HTTP y el mensaje de error del proveedor (p. ej. "Model Not Exist",
// "Insufficient Balance", "Authentication Fails") SIN exponer la clave.
async function pingDeepSeek(apiKey?: string, baseUrl?: string, model?: string) {
  if (!present(apiKey) || !present(baseUrl) || !present(model)) {
    return { configurado: false as const }
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    const res = await fetch(`${baseUrl!.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (res.ok) return { configurado: true as const, ok: true as const, status: res.status, modelo: model }
    const texto = await res.text().catch(() => "")
    return {
      configurado: true as const,
      ok: false as const,
      status: res.status,
      modelo: model,
      error: texto.slice(0, 300),
    }
  } catch (error: any) {
    return { configurado: true as const, ok: false as const, error: error?.name === "AbortError" ? "timeout" : "fallo de red" }
  }
}

async function telegramWebhookInfo(token?: string) {
  if (!present(token)) return { token_configurado: false as const }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      signal: controller.signal,
    })
    clearTimeout(timer)
    const data = await res.json().catch(() => null)
    if (!data?.ok) return { token_configurado: true as const, ok: false as const }
    const r = data.result || {}
    return {
      token_configurado: true as const,
      ok: true as const,
      url: r.url || null,
      pending_update_count: r.pending_update_count ?? null,
      last_error_message: r.last_error_message || null,
      last_error_date: r.last_error_date || null,
    }
  } catch {
    return { token_configurado: true as const, ok: false as const, error: "no se pudo consultar getWebhookInfo" }
  }
}

export async function GET(request: Request) {
  try {
    await requireRoles(["admin"])
  } catch (error) {
    if (error instanceof AuthzError) return NextResponse.json({ error: error.message }, { status: 403 })
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  const env = process.env
  const hacerPing = new URL(request.url).searchParams.get("ping") === "1"

  const botWeb = {
    DEEPSEEK_API_KEY: present(env.DEEPSEEK_API_KEY),
    DEEPSEEK_MODEL: present(env.DEEPSEEK_MODEL),
    DEEPSEEK_BASE_URL: present(env.DEEPSEEK_BASE_URL),
  }
  const botTelegram = {
    TELEGRAM_BOT_TOKEN: present(env.TELEGRAM_BOT_TOKEN),
    TELEGRAM_WEBHOOK_SECRET: present(env.TELEGRAM_WEBHOOK_SECRET),
    TELEGRAM_ALLOWED_CHAT_ID: present(env.TELEGRAM_ALLOWED_CHAT_ID),
    TELEGRAM_ALLOWED_USER_IDS: present(env.TELEGRAM_ALLOWED_USER_IDS),
    DEEPSEEK_TELEGRAM_API_KEY: present(env.DEEPSEEK_TELEGRAM_API_KEY),
    DEEPSEEK_TELEGRAM_BASE_URL: present(env.DEEPSEEK_TELEGRAM_BASE_URL),
    DEEPSEEK_TELEGRAM_MODEL: present(env.DEEPSEEK_TELEGRAM_MODEL),
  }
  const infraestructura = {
    NEXT_PUBLIC_SUPABASE_URL: present(env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: present(env.SUPABASE_SERVICE_ROLE_KEY),
    telegram_modo_escritura: env.TELEGRAM_CAJERO_ENABLE_WRITE_ACTIONS === "true",
  }

  // Valores NO secretos utiles para verificar la allowlist (el admin es el dueno).
  const allowlist = {
    chat_id: env.TELEGRAM_ALLOWED_CHAT_ID?.trim() || null,
    user_ids: (env.TELEGRAM_ALLOWED_USER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  }

  let telegram_bot_sessions: Record<string, unknown> = { existe: null }
  const admin = createAdminClient()
  if (!admin) {
    telegram_bot_sessions = {
      existe: null,
      nota: "No se pudo crear el cliente service-role (falta o es invalida SUPABASE_SERVICE_ROLE_KEY).",
    }
  } else {
    const { error } = await admin.from("telegram_bot_sessions").select("id", { count: "exact", head: true })
    telegram_bot_sessions = error ? { existe: false, error: error.message } : { existe: true }
  }

  const telegram_webhook = await telegramWebhookInfo(env.TELEGRAM_BOT_TOKEN)

  const sinPing = { nota: "Agrega ?ping=1 a la URL para probar DeepSeek en vivo." }
  const deepseek_test = {
    web: hacerPing ? await pingDeepSeek(env.DEEPSEEK_API_KEY, env.DEEPSEEK_BASE_URL, env.DEEPSEEK_MODEL) : sinPing,
    telegram: hacerPing
      ? await pingDeepSeek(
          env.DEEPSEEK_TELEGRAM_API_KEY || env.DEEPSEEK_API_KEY,
          env.DEEPSEEK_TELEGRAM_BASE_URL || env.DEEPSEEK_BASE_URL,
          env.DEEPSEEK_TELEGRAM_MODEL || env.DEEPSEEK_MODEL
        )
      : sinPing,
  }

  const variables_faltantes = Object.entries({
    ...botWeb,
    ...botTelegram,
    NEXT_PUBLIC_SUPABASE_URL: infraestructura.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: infraestructura.SUPABASE_SERVICE_ROLE_KEY,
  })
    .filter(([, presente]) => presente === false)
    .map(([nombre]) => nombre)

  return NextResponse.json({
    generado_en: new Date().toISOString(),
    bot_web_asistente_ia: {
      env: botWeb,
      listo: Object.values(botWeb).every(Boolean),
    },
    bot_telegram_cajero: {
      env: botTelegram,
      allowlist,
      allowlist_configurada: Boolean(allowlist.chat_id) && allowlist.user_ids.length > 0,
      telegram_webhook,
      listo:
        Object.values(botTelegram).every(Boolean) &&
        Boolean(allowlist.chat_id) &&
        allowlist.user_ids.length > 0,
    },
    infraestructura,
    telegram_bot_sessions,
    deepseek_test,
    variables_faltantes,
  })
}
