import { describe, expect, it } from "vitest"
import { secretoCoincide, tokenBearer } from "./secretos"

describe("secretoCoincide", () => {
  it("solo acepta el secreto exacto", () => {
    expect(secretoCoincide("abc123", "abc123")).toBe(true)
    expect(secretoCoincide("abc124", "abc123")).toBe(false)
    expect(secretoCoincide("abc12", "abc123")).toBe(false)
  })

  it("rechaza si no hay secreto configurado o no llega", () => {
    expect(secretoCoincide("algo", undefined)).toBe(false)
    expect(secretoCoincide("algo", "")).toBe(false)
    expect(secretoCoincide(null, "abc")).toBe(false)
    expect(secretoCoincide("", "")).toBe(false)
  })
})

describe("tokenBearer", () => {
  it("lee el token del encabezado Authorization", () => {
    expect(tokenBearer(new Request("https://x.test", { headers: { authorization: "Bearer xyz" } }))).toBe("xyz")
    expect(tokenBearer(new Request("https://x.test", { headers: { authorization: "Basic xyz" } }))).toBeNull()
    expect(tokenBearer(new Request("https://x.test"))).toBeNull()
  })
})
