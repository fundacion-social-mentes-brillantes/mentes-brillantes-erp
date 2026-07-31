// Configuracion CENTRAL del modelo de DeepSeek que usan los dos bots del ERP
// (el asistente web /asistente-ia y el cajero de Telegram).
//
// Modelo de los bots. Hoy v4-flash (0731): mas capaz que v4-pro (50 vs 44 en el
// Indice de Inteligencia de Artificial Analysis) y ~3x mas barato. La mejora del
// 0731 fue justo para tareas de agente (usar herramientas), que es lo que hacen
// estos bots.
// Para volver a Pro NO hay que tocar codigo: basta definir DEEPSEEK_MODEL en el
// entorno de despliegue (o DEEPSEEK_TELEGRAM_MODEL solo para el bot de Telegram).
export const MODELO_DEEPSEEK = "deepseek-v4-flash"

/** Modelo efectivo del bot web. Se lee del entorno en cada llamada. */
export function modeloDeepSeek(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || MODELO_DEEPSEEK
}

/**
 * Modelo efectivo del bot de Telegram: su variable propia manda; si no existe,
 * hereda la del bot web y, en ultimo caso, el modelo por defecto.
 */
export function modeloDeepSeekTelegram(): string {
  return process.env.DEEPSEEK_TELEGRAM_MODEL?.trim() || modeloDeepSeek()
}

// El modo "pensar" queda apagado a proposito (mas rapido y mas barato). Se
// enciende cuando haga falta cambiando "disabled" por "enabled" aqui: los dos
// bots leen esta misma constante. OJO: el valor por defecto de DeepSeek es
// "enabled", por eso se manda siempre explicito en cada llamada.
export const PENSAR_DEEPSEEK: { type: "enabled" | "disabled" } = { type: "disabled" }
