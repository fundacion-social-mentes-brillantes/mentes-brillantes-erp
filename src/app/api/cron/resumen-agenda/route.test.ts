import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }))

const { GET } = await import("./route")

describe("cron resumen-agenda", () => {
  beforeEach(() => vi.stubEnv("CRON_SECRET", "secreto-del-cron"))
  afterEach(() => vi.unstubAllEnvs())

  it("rechaza a quien solo manda el encabezado x-vercel-cron (cualquiera puede escribirlo)", async () => {
    const r = await GET(new Request("https://erp.test/api/cron/resumen-agenda", { headers: { "x-vercel-cron": "1" } }))
    expect(r.status).toBe(401)
  })

  it("rechaza un secreto equivocado", async () => {
    const r = await GET(new Request("https://erp.test/api/cron/resumen-agenda", { headers: { authorization: "Bearer otro" } }))
    expect(r.status).toBe(401)
  })

  it("deja pasar el secreto correcto (aqui sin base configurada responde 503)", async () => {
    const r = await GET(
      new Request("https://erp.test/api/cron/resumen-agenda", { headers: { authorization: "Bearer secreto-del-cron" } })
    )
    expect(r.status).toBe(503)
  })

  it("sin CRON_SECRET configurado no deja pasar a nadie", async () => {
    vi.stubEnv("CRON_SECRET", "")
    const r = await GET(new Request("https://erp.test/api/cron/resumen-agenda", { headers: { authorization: "Bearer " } }))
    expect(r.status).toBe(401)
  })
})
