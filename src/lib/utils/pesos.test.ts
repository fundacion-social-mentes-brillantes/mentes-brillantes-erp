import { describe, expect, it } from "vitest"
import { miles, pesos } from "./pesos"

const sinEspacioDuro = (s: string) => s.replace(/ /g, " ")

describe("pesos", () => {
  it("usa punto de miles y nunca coma", () => {
    expect(sinEspacioDuro(pesos(100000))).toBe("$ 100.000")
    expect(sinEspacioDuro(pesos(57426000))).toBe("$ 57.426.000")
    expect(sinEspacioDuro(pesos("4127300.00"))).toBe("$ 4.127.300")
  })

  it("redondea a pesos enteros", () => {
    expect(sinEspacioDuro(pesos(1999.6))).toBe("$ 2.000")
  })

  it("el signo va antes del $ y un cero no lleva signo", () => {
    expect(sinEspacioDuro(pesos(-5000))).toBe("-$ 5.000")
    expect(sinEspacioDuro(pesos(-0))).toBe("$ 0")
    expect(sinEspacioDuro(pesos(0))).toBe("$ 0")
  })

  it("lo que no es numero se muestra como cero", () => {
    expect(sinEspacioDuro(pesos(null))).toBe("$ 0")
    expect(sinEspacioDuro(pesos("abc"))).toBe("$ 0")
  })

  it("el $ y la cifra no se separan de renglon", () => {
    expect(pesos(1000)).toContain(" ")
  })
})

describe("miles", () => {
  it("solo la cifra", () => {
    expect(miles(2289)).toBe("2.289")
    expect(miles(undefined)).toBe("0")
  })
})
