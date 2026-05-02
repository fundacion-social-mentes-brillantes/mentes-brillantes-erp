import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { redactTraceValue } from "../traces/logger"

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? files(full) : [full]
  })
}

describe("telegram cajero security", () => {
  it("no deja tokens hardcodeados en modulos del cajero", () => {
    const root = join(process.cwd(), "src/lib/telegram-cajero")
    const source = files(root)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n")

    expect(source).not.toMatch(/bot\d+:[A-Za-z0-9_-]{20,}/)
  })

  it("redacta secretos conocidos en trazas", () => {
    expect(redactTraceValue("TELEGRAM_BOT_TOKEN bot123:abc")).toContain("[secret-name]")
    expect(redactTraceValue("TELEGRAM_BOT_TOKEN bot123:abc")).toContain("[telegram-token]")
  })

  it("handler usa memoria durable explicita y no memory legacy", () => {
    const handler = readFileSync(join(process.cwd(), "src/lib/telegram-cajero/handler.ts"), "utf8")
    expect(handler).toContain("@/lib/telegram-cajero/memory/index")
    expect(handler).not.toContain("@/lib/telegram-cajero/memory\"")
  })
})
