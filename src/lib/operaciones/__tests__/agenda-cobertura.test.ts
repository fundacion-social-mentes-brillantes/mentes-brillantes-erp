import { describe, expect, it } from "vitest"
import { repartirCupo, type EstadoCupo } from "../agenda-cobertura"

const paquete = (over: Partial<EstadoCupo["paquetes"][number]> = {}) => ({
  id: "p1",
  concepto: "Sesión guía coach - 10 sesiones",
  creadoEn: "2026-01-01T00:00:00Z",
  compradas: 10,
  usadas: 0,
  pendiente: 0,
  ...over,
})

describe("repartirCupo", () => {
  it("sin paquetes, ninguna sesión está comprada", () => {
    const [uno] = repartirCupo({ paquetes: [], deudaTotal: 0 }, 1)

    expect(uno.tieneCupo).toBe(false)
    expect(uno.accion).toContain("crear su cobro")
  })

  it("nombra la deuda cuando no hay cupo, que es lo que hay que ir a cobrar", () => {
    const [uno] = repartirCupo({ paquetes: [], deudaTotal: 1903300 }, 1)

    expect(uno.resumen).toContain("sin cupo")
    expect(uno.resumen).toContain("$1.903.300")
  })

  it("con cupo pagado no hay nada que cobrar", () => {
    const [uno] = repartirCupo({ paquetes: [paquete()], deudaTotal: 0 }, 1)

    expect(uno.tieneCupo).toBe(true)
    expect(uno.paquetePagado).toBe(true)
    expect(uno.accion).toContain("no hay nada que cobrar")
  })

  it("avisa cuando la sesión sale de un paquete que todavía se debe", () => {
    const estado = { paquetes: [paquete({ pendiente: 2500000 })], deudaTotal: 2500000 }

    const [uno] = repartirCupo(estado, 1)

    expect(uno.tieneCupo).toBe(true)
    expect(uno.paquetePagado).toBe(false)
    expect(uno.resumen).toContain("$2.500.000")
  })

  // El punto de todo el módulo: el cupo es un saldo que se agota.
  it("cubre solo hasta donde alcanza el cupo, no todas las sesiones", () => {
    const estado = { paquetes: [paquete({ compradas: 3, usadas: 2 })], deudaTotal: 0 }

    const reparto = repartirCupo(estado, 3)

    expect(reparto.map((c) => c.tieneCupo)).toEqual([true, false, false])
  })

  it("descuenta el cupo sesión a sesión", () => {
    const estado = { paquetes: [paquete({ compradas: 2 })], deudaTotal: 0 }

    const reparto = repartirCupo(estado, 2)

    expect(reparto.map((c) => c.cupoAntes)).toEqual([2, 1])
  })

  it("gasta primero el paquete más viejo, igual que al registrar", () => {
    const estado: EstadoCupo = {
      paquetes: [
        paquete({ id: "viejo", concepto: "viejo", compradas: 1, creadoEn: "2026-01-01T00:00:00Z" }),
        paquete({ id: "nuevo", concepto: "nuevo", compradas: 1, creadoEn: "2026-06-01T00:00:00Z" }),
      ],
      deudaTotal: 0,
    }

    const reparto = repartirCupo(estado, 2)

    expect(reparto.map((c) => c.paquete)).toEqual(["viejo", "nuevo"])
  })

  it("un paquete agotado no presta cupo", () => {
    const estado = { paquetes: [paquete({ compradas: 4, usadas: 4 })], deudaTotal: 0 }

    expect(repartirCupo(estado, 1)[0].tieneCupo).toBe(false)
  })

  it("sin datos de la persona no inventa cupo", () => {
    expect(repartirCupo(undefined, 2).every((c) => !c.tieneCupo)).toBe(true)
  })
})
