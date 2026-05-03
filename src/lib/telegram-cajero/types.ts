// ─── Telegram primitive types ──────────────────────────────────────────────

export type TelegramUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
}

export type TelegramChat = {
  id: number
  title?: string
  type?: string
}

export type TelegramMessage = {
  message_id: number
  text?: string
  chat: TelegramChat
  from?: TelegramUser
  reply_to_message?: TelegramMessage
}

export type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
}

export type TelegramConfig = {
  botToken: string
  webhookSecret: string
  allowedChatId?: string
  allowedUserIds: Set<string>
  deepseek: {
    apiKey?: string
    baseUrl?: string
    model?: string
  }
}

// ─── Intent types ───────────────────────────────────────────────────────────

export type PendingAction =
  | "estado_persona"
  | "estado_completo_persona"
  | "ultima_sesion_coach"
  | "sesiones_coach_persona"
  | "pagos_persona"
  | "ultimo_pago_persona"
  | "cuentas_pendientes_persona"
  | "saldo_favor_persona"
  | "donaciones_persona"
  | "compras_persona"

export type DeepSeekIntent =
  | PendingAction
  | "ventas_externas"
  | "egresos"
  | "resumen_periodo"
  | "liquidacion_socio"
  | "cartera_pendiente_global"
  | "busqueda_global"
  | "pregunta_general_erp"
  | "saludo"
  | "ayuda"
  | "id"
  | "no_entendido"

export type Intent = {
  intent: DeepSeekIntent
  persona_busqueda: string | null
  socio_busqueda: string | null
  termino_busqueda: string | null
  fecha_desde: string | null
  fecha_hasta: string | null
  metodo_pago: string | null
  concepto: string | null
  necesita_aclaracion: boolean
  pregunta_aclaracion: string | null
}
