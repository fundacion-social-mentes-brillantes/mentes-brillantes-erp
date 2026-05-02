/**
 * memory.ts — Módulo de memoria conversacional del Cajero Mentes Brillantes.
 *
 * Responsabilidades:
 *  - Clave única: `chat_id:user_id` — nunca mezcla usuarios en un mismo grupo.
 *  - TTL de 10 minutos para contexto y selección pendiente.
 *  - Tipado explícito para cada campo del contexto.
 *  - Sin escrituras a Supabase; todo en memoria del proceso (Map).
 *  - No imprime tokens, secrets ni variables de entorno.
 */

import type { DeepSeekIntent, PendingAction, TelegramMessage } from "./types"

// ─── TTL ────────────────────────────────────────────────────────────────────
const PENDING_TTL_MS = 10 * 60 * 1000 // 10 minutos
const CONTEXT_TTL_MS = 10 * 60 * 1000 // 10 minutos

// ─── Sub-tipos ───────────────────────────────────────────────────────────────

export type AsisteнteRef = {
  id: string
  nombre: string
  codigo?: string | null
  cedula?: string | null
}

export type DateRange = {
  desde: string | null
  hasta: string | null
}

export type CajeroConversationContext = {
  /** Timestamp de última actualización (para TTL). */
  createdAt: number
  /** Última intención resuelta (para inferir seguimiento sin IA). */
  lastMode: DeepSeekIntent
  /** Término de búsqueda que generó el contexto actual. */
  lastSearchTerm?: string
  /** Último asistente identificado de forma unívoca. */
  lastAsistente?: AsisteнteRef
  /** Rango de fechas del último filtro aplicado. */
  lastDateRange?: DateRange
  /** Filtros libres del último query (metodo_pago, concepto, etc.). */
  lastFilters?: Record<string, string | null>
  /** Resumen textual de la última respuesta (para depuración). */
  lastResultSummary?: string
  /**
   * message_id del mensaje al que se responde, cuando el usuario hace
   * reply al bot. Sirve para anclar el contexto al hilo correcto.
   */
  replyAnchor?: number
}

export type PendingSelection = {
  createdAt: number
  action: PendingAction
  matches: Array<{ nombre: string; codigo?: string | null; cedula?: string | null }>
}

// ─── Stores internos ─────────────────────────────────────────────────────────
// Instancias de módulo; aisladas por usuario+chat, no por servicio.
const _contexts = new Map<string, CajeroConversationContext>()
const _pending = new Map<string, PendingSelection>()

// ─── Clave de memoria ─────────────────────────────────────────────────────────
/**
 * Genera la clave única de memoria para un mensaje.
 * Incluye chat_id y user_id para aislar conversaciones entre usuarios del mismo grupo.
 * Retorna null si el mensaje no tiene remitente (no almacenamos datos anónimos).
 */
function memoryKey(message: TelegramMessage): string | null {
  const userId = message.from?.id
  if (!userId) return null
  return `${message.chat.id}:${userId}`
}

// ─── Context helpers ──────────────────────────────────────────────────────────

/**
 * Recupera el contexto conversacional del usuario/chat.
 * Devuelve null si no existe o si el TTL expiró.
 */
export function getContext(message: TelegramMessage): CajeroConversationContext | null {
  const key = memoryKey(message)
  if (!key) return null

  const ctx = _contexts.get(key)
  if (!ctx) return null

  if (Date.now() - ctx.createdAt > CONTEXT_TTL_MS) {
    _contexts.delete(key)
    return null
  }

  return ctx
}

/**
 * Guarda o actualiza el contexto del usuario/chat.
 * Siempre renueva el createdAt para reiniciar el TTL.
 * Captura replyAnchor automáticamente si hay reply_to_message.
 */
export function saveContext(
  message: TelegramMessage,
  ctx: Omit<CajeroConversationContext, "createdAt">
): void {
  const key = memoryKey(message)
  if (!key) return

  _contexts.set(key, {
    ...ctx,
    createdAt: Date.now(),
    replyAnchor: message.reply_to_message?.message_id ?? ctx.replyAnchor,
  })
}

/**
 * Elimina el contexto del usuario/chat explícitamente.
 * Útil para resets manuales o cuando el usuario cambia de tema radicalmente.
 */
export function clearContext(message: TelegramMessage): void {
  const key = memoryKey(message)
  if (key) _contexts.delete(key)
}

// ─── PendingSelection helpers ─────────────────────────────────────────────────

/**
 * Recupera la selección pendiente (lista de coincidencias en espera de elección).
 * Retorna "expired" si el TTL venció, null si no existe.
 */
export function getPendingSelection(
  message: TelegramMessage
): PendingSelection | "expired" | null {
  const key = memoryKey(message)
  if (!key) return null

  const pending = _pending.get(key)
  if (!pending) return null

  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    _pending.delete(key)
    return "expired"
  }

  return pending
}

/**
 * Guarda una selección pendiente para el usuario/chat.
 * Solo se activa cuando hay múltiples coincidencias de nombre.
 */
export function savePendingSelection(
  message: TelegramMessage,
  action: PendingAction,
  matches: PendingSelection["matches"]
): void {
  const key = memoryKey(message)
  if (!key) return
  _pending.set(key, { createdAt: Date.now(), action, matches })
}

/**
 * Elimina la selección pendiente (tras resolución exitosa o cancelación).
 */
export function clearPendingSelection(message: TelegramMessage): void {
  const key = memoryKey(message)
  if (key) _pending.delete(key)
}

/**
 * Intenta resolver la selección pendiente a partir del texto del usuario.
 *
 * Acepta:
 *   - Número de posición ("1", "2", ...)
 *   - Código o cédula exacta
 *   - Nombre parcial
 *
 * Devuelve:
 *   - { term, action } si se resolvió
 *   - "expired" si el TTL venció
 *   - null si no había selección pendiente o no matcheó ninguna opción
 */
export function resolvePendingSelection(
  message: TelegramMessage,
  rawText: string
): { term: string; action: PendingAction } | "expired" | null {
  const pending = getPendingSelection(message)
  if (!pending) return null
  if (pending === "expired") return "expired"

  const text = rawText.trim()
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  // Resolución por posición numérica (ej: "1", "2")
  if (/^\d{1,2}$/.test(normalized)) {
    const index = Number(normalized) - 1
    if (index >= 0 && index < pending.matches.length) {
      const match = pending.matches[index]
      const term = match.codigo || match.cedula || match.nombre
      return { term, action: pending.action }
    }
    // Número fuera de rango → no es una selección válida
    return null
  }

  // Resolución por código o cédula exacta
  const codeMatch = normalized.match(/^(?:codigo|cod)\s+(\d{1,20})$/)
  const code = codeMatch?.[1] ?? (/^\d{1,8}$/.test(normalized) ? normalized : null)

  if (code) {
    const byCode = pending.matches.find(
      (m) =>
        String(m.codigo || "").toLowerCase() === code ||
        String(m.cedula || "").toLowerCase() === code
    )
    if (byCode) {
      return { term: byCode.codigo || byCode.cedula || byCode.nombre, action: pending.action }
    }
  }

  // Resolución por nombre parcial
  const byName = pending.matches.find((m) => {
    const nombre = m.nombre
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    return nombre === normalized || nombre.includes(normalized) || normalized.includes(nombre)
  })
  if (byName) {
    return { term: byName.codigo || byName.cedula || byName.nombre, action: pending.action }
  }

  return null
}
