export type DraftActionKind =
  | "registrar_pago"
  | "crear_cuenta"
  | "anular_pago"
  | "aplicar_saldo_favor"
  | "crear_egreso"
  | "crear_venta_externa"
  | "subir_comprobante"

export type DraftAction = {
  id: string
  kind: DraftActionKind
  summary: string
  payload: Record<string, unknown>
  createdAt: string
  status: "draft" | "cancelled" | "blocked"
}

export type DraftActionResult = {
  status: "prepared" | "cancelled" | "blocked"
  action?: DraftAction
  message: string
}
