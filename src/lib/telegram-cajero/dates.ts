export const TELEGRAM_CAJERO_TIME_ZONE = "America/Bogota"

export type DateRange = {
  from: string
  to: string
  label: string
}

function iso(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function resolveNaturalDateRange(text: string, now = new Date()): DateRange | null {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  if (/\bhoy\b/.test(normalized)) {
    const value = iso(now)
    return { from: value, to: value, label: "hoy" }
  }

  if (/\bayer\b/.test(normalized)) {
    const value = new Date(now)
    value.setDate(now.getDate() - 1)
    return { from: iso(value), to: iso(value), label: "ayer" }
  }

  if (/\beste mes\b|\bmes actual\b/.test(normalized)) {
    return {
      from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      label: "este mes",
    }
  }

  const explicit = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (explicit) return { from: explicit[1], to: explicit[1], label: explicit[1] }

  return null
}
