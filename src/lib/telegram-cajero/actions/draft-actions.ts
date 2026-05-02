import type { DraftAction, DraftActionKind, DraftActionResult } from "./types"

function id() {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function prepareDraftAction(kind: DraftActionKind, summary: string, payload: Record<string, unknown> = {}): DraftActionResult {
  const action: DraftAction = {
    id: id(),
    kind,
    summary,
    payload,
    createdAt: new Date().toISOString(),
    status: "draft",
  }

  return {
    status: "prepared",
    action,
    message: "Puedo preparar el borrador, pero todavia no voy a ejecutar nada.",
  }
}

export function detectDraftActionIntent(text: string): DraftActionKind | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (/\b(registra|registrar).*\b(pago|abono)\b/.test(normalized)) return "registrar_pago"
  if (/\b(crea|crear).*\b(cuenta)\b/.test(normalized)) return "crear_cuenta"
  if (/\b(anula|anular).*\b(pago|abono)\b/.test(normalized)) return "anular_pago"
  if (/\b(aplica|aplicar).*\bsaldo\b/.test(normalized)) return "aplicar_saldo_favor"
  if (/\b(crea|crear|registra|registrar).*\begreso\b/.test(normalized)) return "crear_egreso"
  if (/\b(crea|crear|registra|registrar).*\bventa externa\b/.test(normalized)) return "crear_venta_externa"
  if (/\b(comprobante|foto|recibo)\b/.test(normalized)) return "subir_comprobante"
  return null
}
