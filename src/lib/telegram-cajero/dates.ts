export const TELEGRAM_CAJERO_TIME_ZONE = "America/Bogota"

export type DateRange = {
  from: string
  to: string
  label: string
}

type CalendarDate = {
  year: number
  month: number
  day: number
}

const BOGOTA_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TELEGRAM_CAJERO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function iso(date: CalendarDate) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`
}

function calendarDateInBogota(date: Date): CalendarDate | null {
  if (Number.isNaN(date.getTime())) return null

  const parts = BOGOTA_DATE_FORMATTER.formatToParts(date)
  const value = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value)
  const result = {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  }

  return Object.values(result).every(Number.isInteger) ? result : null
}

function calendarDate(year: number, month: number, day: number): CalendarDate {
  return { year, month, day }
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function addDays(date: CalendarDate, amount: number): CalendarDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + amount))
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  }
}

function dayOfWeek(date: CalendarDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()
}

function parseIsoDate(value: string): CalendarDate | null {
  const match = value.match(/^(20\d{2})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const date = calendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
  if (
    date.month < 1 ||
    date.month > 12 ||
    date.day < 1 ||
    date.day > daysInMonth(date.year, date.month)
  ) {
    return null
  }

  return date
}

export function resolveNaturalDateRange(text: string, now = new Date()): DateRange | null {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  const today = calendarDateInBogota(now)
  if (!today) return null

  if (/\bhoy\b/.test(normalized)) {
    const value = iso(today)
    return { from: value, to: value, label: "hoy" }
  }

  if (/\bayer\b/.test(normalized)) {
    const value = iso(addDays(today, -1))
    return { from: value, to: value, label: "ayer" }
  }

  if (/\beste mes\b|\bmes actual\b/.test(normalized)) {
    return {
      from: iso(calendarDate(today.year, today.month, 1)),
      to: iso(calendarDate(today.year, today.month, daysInMonth(today.year, today.month))),
      label: "este mes",
    }
  }

  if (/\bmes pasado\b/.test(normalized)) {
    const previousMonth = today.month === 1 ? 12 : today.month - 1
    const previousYear = today.month === 1 ? today.year - 1 : today.year
    return {
      from: iso(calendarDate(previousYear, previousMonth, 1)),
      to: iso(calendarDate(previousYear, previousMonth, daysInMonth(previousYear, previousMonth))),
      label: "mes pasado",
    }
  }

  if (/\bultimos 7 dias\b|\bultimos siete dias\b/.test(normalized)) {
    return { from: iso(addDays(today, -6)), to: iso(today), label: "ultimos 7 dias" }
  }

  if (/\bultimos 30 dias\b|\bultimos treinta dias\b/.test(normalized)) {
    return { from: iso(addDays(today, -29)), to: iso(today), label: "ultimos 30 dias" }
  }

  if (/\besta semana\b/.test(normalized)) {
    const day = dayOfWeek(today) || 7
    const from = addDays(today, -day + 1)
    const to = addDays(from, 6)
    return { from: iso(from), to: iso(to), label: "esta semana" }
  }

  if (/\bsemana pasada\b/.test(normalized)) {
    const day = dayOfWeek(today) || 7
    const to = addDays(today, -day)
    const from = addDays(to, -6)
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

  const monthMatch = normalized.match(
    new RegExp(`\\b(${months.join("|")})(?:\\s+(?:(?:de|del)\\s+)?(20\\d{2}))?\\b`),
  )
  const monthIndex = monthMatch ? months.indexOf(monthMatch[1]) : -1
  if (monthIndex >= 0) {
    const year = monthMatch?.[2] ? Number(monthMatch[2]) : today.year
    const month = monthIndex + 1
    return {
      from: iso(calendarDate(year, month, 1)),
      to: iso(calendarDate(year, month, daysInMonth(year, month))),
      label: monthMatch?.[2] ? `${months[monthIndex]} ${year}` : months[monthIndex],
    }
  }

  if (/\bprimer trimestre\b/.test(normalized)) {
    return {
      from: iso(calendarDate(today.year, 1, 1)),
      to: iso(calendarDate(today.year, 3, 31)),
      label: "primer trimestre",
    }
  }

  if (/\bultimo trimestre\b/.test(normalized)) {
    const quarter = Math.floor((today.month - 1) / 3)
    const startMonth = Math.max(0, (quarter - 1) * 3)
    const firstMonth = startMonth + 1
    const lastMonth = startMonth + 3
    return {
      from: iso(calendarDate(today.year, firstMonth, 1)),
      to: iso(calendarDate(today.year, lastMonth, daysInMonth(today.year, lastMonth))),
      label: "ultimo trimestre",
    }
  }

  const slash = normalized.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/)
  if (slash) {
    const [, day, month, year] = slash
    const parsed = parseIsoDate(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`)
    if (!parsed) return null
    const value = iso(parsed)
    return { from: value, to: value, label: value }
  }

  const range = normalized.match(
    /desde\s+(20\d{2}-\d{2}-\d{2})\s+hasta\s+(20\d{2}-\d{2}-\d{2})/,
  )
  if (range) {
    const from = parseIsoDate(range[1])
    const to = parseIsoDate(range[2])
    if (!from || !to || iso(from) > iso(to)) return null
    return { from: iso(from), to: iso(to), label: `desde ${iso(from)} hasta ${iso(to)}` }
  }

  const explicit = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (explicit) {
    const parsed = parseIsoDate(explicit[1])
    if (!parsed) return null
    const value = iso(parsed)
    return { from: value, to: value, label: value }
  }

  return null
}
