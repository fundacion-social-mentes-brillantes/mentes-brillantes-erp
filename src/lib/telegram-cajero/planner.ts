export type PlannedTask = {
  intent: string
  text: string
}

export function planTelegramQuestion(text: string, maxTasks = 4): PlannedTask[] {
  const parts = text
    .split(/\s+(?:y|ademas|además|tambien|también)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length <= 1) return [{ intent: "auto", text: text.trim() }]
  return parts.slice(0, maxTasks).map((part) => ({ intent: "auto", text: part }))
}
