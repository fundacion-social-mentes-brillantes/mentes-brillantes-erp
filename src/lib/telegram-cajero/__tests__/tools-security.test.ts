import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? files(full) : [full]
  })
}

describe("telegram cajero tools security", () => {
  it("no contiene escrituras financieras ni rpc en tools de lectura", () => {
    const root = join(process.cwd(), "src/lib/telegram-cajero/tools")
    const source = files(root)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n")

    expect(source).not.toMatch(/\.(insert|update|delete|upsert|rpc)\s*\(/)
  })
})
