import type { DraftAction, DraftActionResult } from "./types"

export function writeActionsEnabled() {
  return process.env.TELEGRAM_CAJERO_ENABLE_WRITE_ACTIONS === "true"
}

export function confirmAction(action?: DraftAction | null): DraftActionResult {
  if (!action) {
    return { status: "blocked", message: "No tengo una accion pendiente para confirmar." }
  }

  return {
    status: "blocked",
    action: { ...action, status: "blocked" },
    message:
      "La confirmacion esta recibida, pero el modo escritura del cajero no esta activo. No registre ni modifique nada en el ERP.",
  }
}

export function cancelAction(action?: DraftAction | null): DraftActionResult {
  if (!action) return { status: "cancelled", message: "Listo, no habia una accion pendiente." }
  return {
    status: "cancelled",
    action: { ...action, status: "cancelled" },
    message: "Listo, cancele ese borrador. No se modifico nada en el ERP.",
  }
}
