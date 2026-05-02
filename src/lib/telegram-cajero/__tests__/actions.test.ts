import { describe, expect, it } from "vitest"
import { cancelAction, confirmAction, detectDraftActionIntent, prepareDraftAction } from "../actions"

describe("telegram cajero draft actions", () => {
  it("prepara borrador pero no ejecuta escritura", () => {
    const kind = detectDraftActionIntent("registra un pago de 100000 a Ana por nequi")
    expect(kind).toBe("registrar_pago")
    const draft = prepareDraftAction(kind!, "Pago de Ana")
    expect(draft.status).toBe("prepared")
    expect(draft.message).toContain("borrador")
  })

  it("bloquea confirmacion de escritura", () => {
    const draft = prepareDraftAction("registrar_pago", "Pago de Ana").action
    const result = confirmAction(draft)
    expect(result.status).toBe("blocked")
    expect(result.message).toContain("no esta activo")
  })

  it("cancela sin modificar nada", () => {
    const draft = prepareDraftAction("crear_cuenta", "Cuenta de Ana").action
    expect(cancelAction(draft).message).toContain("No se modifico nada")
  })
})
