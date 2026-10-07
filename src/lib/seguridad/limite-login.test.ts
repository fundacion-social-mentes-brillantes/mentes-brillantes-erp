import { describe, expect, it, vi } from "vitest"

// Sin base: el limitador usa su respaldo en memoria.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }))

const { loginBloqueado, olvidarIntentosDeLogin } = await import("./limite-login")

const desde = (ip: string) => ({ get: (nombre: string) => (nombre === "x-forwarded-for" ? ip : null) })

describe("candado de inicio de sesion", () => {
  it("bloquea una cuenta tras 8 intentos, aunque cambien las mayusculas del correo", async () => {
    const resultados: boolean[] = []
    for (let i = 0; i < 9; i += 1) {
      resultados.push(await loginBloqueado(i % 2 ? "Ana@Ejemplo.com " : "ana@ejemplo.com", desde(`10.0.0.${i}`)))
    }
    expect(resultados.slice(0, 8).every((b) => b === false)).toBe(true)
    expect(resultados[8]).toBe(true)
  })

  it("entrar bien deja la cuenta en cero", async () => {
    for (let i = 0; i < 8; i += 1) await loginBloqueado("beto@ejemplo.com", desde(`10.1.0.${i}`))
    await olvidarIntentosDeLogin("BETO@ejemplo.com")
    expect(await loginBloqueado("beto@ejemplo.com", desde("10.1.1.1"))).toBe(false)
  })

  it("frena a una misma conexion que prueba muchas cuentas", async () => {
    let bloqueado = false
    for (let i = 0; i < 31; i += 1) bloqueado = await loginBloqueado(`persona${i}@ejemplo.com`, desde("200.1.1.1"))
    expect(bloqueado).toBe(true)
  })
})
