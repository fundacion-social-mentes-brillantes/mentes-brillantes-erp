import { BOT_USERNAME } from "./config"
import type { TelegramMessage } from "./types"

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

export function isSlashCommand(text: string) {
  return text.trim().startsWith("/")
}

export function parseCommand(text: string) {
  const [rawCommand, ...rest] = text.trim().split(/\s+/)
  const command = rawCommand.split("@")[0].toLowerCase()
  return {
    command,
    args: rest.join(" ").trim(),
  }
}

export function extractNaturalText(message: TelegramMessage) {
  return (message.text || "")
    .replace(new RegExp(`@${BOT_USERNAME}`, "gi"), "")
    .replace(/^(cajero|cajerito|caja)\b[:,]?\s*/i, "")
    .replace(/\b(cajero|cajerito|caja)\b[:,]?\s*/gi, "")
    .trim()
}

export function splitTelegramLines(text: string) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean)
}
