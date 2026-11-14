import { describe, expect, it } from "vitest"
import { enlaceBoleta, esMenorDeEdad, mensajeBoleta, numeroWhatsApp, whatsappBoleta } from "../talleres-reglas"

// Reenviarle a alguien su boleta por WhatsApp desde la lista de inscritos.

const CODIGO = "d49613c8682b4ea1bccfab034f0aa570"
const SITIO = "https://talleres.gimnasioemocionalmb.com"

describe("reenviar la boleta por WhatsApp", () => {
  it("el enlace general de la boleta sirve para cualquier taller", () => {
    expect(enlaceBoleta(SITIO, CODIGO)).toBe(`${SITIO}/boleta/?c=${CODIGO}`)
    expect(enlaceBoleta(`${SITIO}/`, CODIGO)).toBe(`${SITIO}/boleta/?c=${CODIGO}`)
  })

  it("un celular colombiano lleva el 57; uno con indicativo queda igual; sin celular no hay numero", () => {
    expect(numeroWhatsApp("3001234567")).toBe("573001234567")
    expect(numeroWhatsApp("300 123 4567")).toBe("573001234567")
    expect(numeroWhatsApp("573001234567")).toBe("573001234567")
    expect(numeroWhatsApp(null)).toBeNull()
    expect(numeroWhatsApp("")).toBeNull()
  })

  it("a un adulto le habla de tu entrada, con su primer nombre", () => {
    const m = mensajeBoleta({ nombre: "Valeria Lopez", documento: "1000223167", taller: "Cena de la Gratitud 2026", enlace: "E" })
    expect(m.split("\n")).toEqual([
      "Hola, Valeria. Esta es tu entrada para Cena de la Gratitud 2026 💛",
      "Ábrela aquí: E",
      "Ese día solo preséntala en la entrada para poder ingresar.",
      "Gimnasio Emocional Mentes Brillantes",
    ])
  })

  it("si es menor de edad le escribe al papá o la mamá: la entrada de <nombre>", () => {
    expect(esMenorDeEdad({ edad: 12 })).toBe(true)
    expect(esMenorDeEdad({ edad: 17, documento: "1020304050" })).toBe(true)
    expect(esMenorDeEdad({ edad: 18, documento: "TI1029384756" })).toBe(false)
    expect(esMenorDeEdad({ documento: "RC1122334455" })).toBe(true)
    expect(esMenorDeEdad({ documento: "1020304050" })).toBe(false)
    const m = mensajeBoleta({ nombre: "Sofía Pérez", documento: "TI1029384756", edad: 9, taller: "Cena", enlace: "E" })
    expect(m.split("\n")[0]).toBe("Hola. Esta es la entrada de Sofía para Cena 💛")
  })

  it("el enlace de WhatsApp lleva el numero y el mensaje ya escrito; sin celular no hay enlace", () => {
    const enlace = whatsappBoleta("3001234567", "Hola, Ana.\nÁbrela aquí: https://x/boleta/?c=1")
    expect(enlace).toBe(`https://wa.me/573001234567?text=${encodeURIComponent("Hola, Ana.\nÁbrela aquí: https://x/boleta/?c=1")}`)
    expect(decodeURIComponent(new URL(enlace!).searchParams.get("text")!)).toContain("?c=1")
    expect(whatsappBoleta(null, "x")).toBeNull()
  })
})
