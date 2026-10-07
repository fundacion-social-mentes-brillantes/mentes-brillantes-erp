import { describe, expect, it, vi } from "vitest"
import JSZip from "jszip"
import { supabaseFalso } from "@/lib/operaciones/__tests__/supabase-falso"

const requireAdminMock = vi.fn()
vi.mock("@/lib/utils/authz", () => ({
  AuthzError: class AuthzError extends Error {},
  requireAdmin: (...a: unknown[]) => requireAdminMock(...a),
}))

const { GET } = await import("./route")

const filas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${String(i).padStart(5, "0")}`, valor_total: 1000 }))
const contexto = (resource: string) => ({ params: Promise.resolve({ resource }) })

describe("respaldo", () => {
  it("el CSV de una tabla trae TODAS las filas (antes se cortaba en 1000)", async () => {
    requireAdminMock.mockResolvedValue({ supabase: supabaseFalso({ cuentas_por_cobrar: filas(2286) }, { maxFilas: 1000 }) })

    const r = await GET(new Request("https://erp.test/api/backup/cuentas_por_cobrar") as any, contexto("cuentas_por_cobrar"))
    const lineas = (await r.text()).trim().split(/\r?\n/)

    expect(r.status).toBe(200)
    expect(lineas).toHaveLength(2287) // encabezado + 2286
  })

  it("el respaldo completo trae todo y su README no tiene advertencias de faltantes", async () => {
    requireAdminMock.mockResolvedValue({
      supabase: supabaseFalso({ cuentas_por_cobrar: filas(2286), pagos_abonos: filas(1929) }, { maxFilas: 1000 }),
    })

    const r = await GET(new Request("https://erp.test/api/backup/full") as any, contexto("full"))
    const zip = await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()))
    const nombres = Object.keys(zip.files)
    const cuentas = await zip.file(nombres.find((n) => n.startsWith("cuentas_por_cobrar"))!)!.async("string")
    const readme = await zip.file(nombres.find((n) => n.startsWith("README"))!)!.async("string")

    expect(cuentas.trim().split(/\r?\n/)).toHaveLength(2287)
    expect(readme).toContain("cuentas_por_cobrar: 2286 filas")
    expect(readme).toContain("pagos_abonos: 1929 filas")
    expect(readme).not.toMatch(/se leyeron .* pero la tabla tiene/)
  })

  it("solo admin", async () => {
    const { AuthzError } = await import("@/lib/utils/authz")
    requireAdminMock.mockRejectedValue(new AuthzError("Acceso denegado"))
    const r = await GET(new Request("https://erp.test/api/backup/full") as any, contexto("full"))
    expect(r.status).toBe(403)
  })

  it("no deja pedir tablas fuera de la lista", async () => {
    requireAdminMock.mockResolvedValue({ supabase: supabaseFalso({}) })
    const r = await GET(new Request("https://erp.test/api/backup/mcp_oauth_artifacts") as any, contexto("mcp_oauth_artifacts"))
    expect(r.status).toBe(400)
  })
})
