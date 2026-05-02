export type PolicyRisk = "low" | "medium" | "high"

export type PolicyDecision = {
  allowed: boolean
  risk: PolicyRisk
  reason?: string
}

const WRITE_INTENT_WORDS = [
  "registra",
  "registrar",
  "crea",
  "crear",
  "anula",
  "anular",
  "borra",
  "elimina",
  "paga",
  "aplica saldo",
  "cierra periodo",
]

export function evaluateReadOnlyPolicy(text: string): PolicyDecision {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  if (WRITE_INTENT_WORDS.some((word) => normalized.includes(word))) {
    return {
      allowed: false,
      risk: "high",
      reason: "El bot de Telegram esta en modo solo lectura. Puedo preparar un borrador futuro, pero no ejecutar escrituras.",
    }
  }

  return { allowed: true, risk: "low" }
}
