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

  if (/\bmes pasado\b/.test(normalized)) {
    return {
      from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      label: "mes pasado",
    }
  }

  if (/\bultimos 7 dias\b|\bultimos siete dias\b/.test(normalized)) {
    const from = new Date(now)
    from.setDate(now.getDate() - 6)
    return { from: iso(from), to: iso(now), label: "ultimos 7 dias" }
  }

  if (/\bultimos 30 dias\b|\bultimos treinta dias\b/.test(normalized)) {
    const from = new Date(now)
    from.setDate(now.getDate() - 29)
    return { from: iso(from), to: iso(now), label: "ultimos 30 dias" }
  }

  if (/\besta semana\b/.test(normalized)) {
    const day = now.getDay() || 7
    const from = new Date(now)
    from.setDate(now.getDate() - day + 1)
    const to = new Date(from)
    to.setDate(from.getDate() + 6)
    return { from: iso(from), to: iso(to), label: "esta semana" }
  }

  if (/\bsemana pasada\b/.test(normalized)) {
    const day = now.getDay() || 7
    const to = new Date(now)
    to.setDate(now.getDate() - day)
    const from = new Date(to)
    from.setDate(to.getDate() - 6)
    return { from: iso(from), to: iso(to), label: "semana pasada" }
  }

  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ]

  const monthIndex = months.findIndex((month) => new RegExp(`\\b${month}\\b`).test(normalized))
  if (monthIndex >= 0) {
    return {
      from: iso(new Date(now.getFullYear(), monthIndex, 1)),
      to: iso(new Date(now.getFullYear(), monthIndex + 1, 0)),
      label: months[monthIndex],
    }
  }

  if (/\bprimer trimestre\b/.test(normalized)) {
    return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(new Date(now.getFullYear(), 3, 0)), label: "primer trimestre" }
  }

  if (/\bultimo trimestre\b|\búltimo trimestre\b/.test(normalized)) {
    const quarter = Math.floor(now.getMonth() / 3)
    const startMonth = Math.max(0, (quarter - 1) * 3)
    return {
      from: iso(new Date(now.getFullYear(), startMonth, 1)),
      to: iso(new Date(now.getFullYear(), startMonth + 3, 0)),
      label: "ultimo trimestre",
    }
  }

  const slash = normalized.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/)
  if (slash) {
    const [, day, month, year] = slash
    const value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    return { from: value, to: value, label: value }
  }

  const explicit = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (explicit) return { from: explicit[1], to: explicit[1], label: explicit[1] }

  const range = normalized.match(/desde\s+(20\d{2}-\d{2}-\d{2})\s+hasta\s+(20\d{2}-\d{2}-\d{2})/)
  if (range) return { from: range[1], to: range[2], label: `desde ${range[1]} hasta ${range[2]}` }

  return null
}
