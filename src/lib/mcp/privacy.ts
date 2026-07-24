const FORBIDDEN_KEYS = new Set([
  "cedula",
  "documento",
  "numero_documento",
  "password",
  "contrasena",
  "token",
  "access_token",
  "refresh_token",
  "telefono",
  "celular",
  "direccion",
  "correo",
  "email",
])

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function keyIsSensitive(key: string): boolean {
  const normalized = normalizeKey(key)
  return FORBIDDEN_KEYS.has(normalized) || normalized.includes("nota") || normalized.includes("observacion")
}

export function sanitizeMcpData(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[contenido omitido]"
  if (Array.isArray(value)) return value.map((entry) => sanitizeMcpData(entry, depth + 1))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !keyIsSensitive(key))
        .map(([key, entry]) => [key, sanitizeMcpData(entry, depth + 1)])
    )
  }
  if (typeof value === "string" && value.length > 4000) return `${value.slice(0, 4000)}…`
  return value
}
