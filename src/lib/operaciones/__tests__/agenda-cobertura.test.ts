import { describe, expect, it } from "vitest"
import { cargarEstadoCupo, repartirCupo, type EstadoCupo } from "../agenda-cobertura"

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

/** Supabase falso para la carga: responde según la tabla que se consulte. */
function fakeAdmin(datos: { paquetes?: any[]; sesiones?: any[]; cuentas?: any[] }) {
  return {
    from(tabla: string) {
      const resolver = async () => {
        if (tabla === "coach_paquetes") return { data: datos.paquetes ?? [], error: null }
        if (tabla === "coach_sesiones") return { data: datos.sesiones ?? [], error: null }
        if (tabla === "cuentas_por_cobrar") return { data: datos.cuentas ?? [], error: null }
        return { data: [], error: null }
      }
      const q: any = {
        select: () => q,
        in: () => q,
        then: (res: any, rej: any) => resolver().then(res, rej),
      }
      return q
    },
  }
}

describe("cargarEstadoCupo", () => {
  const cuentaPagada = { concepto: "Paquete de 10", valor_total: 1000000, pagos_abonos: [{ monto: 1000000, estado: "activo" }] }

  it("cuenta como usadas solo las sesiones de cada paquete", async () => {
    const mapa = await cargarEstadoCupo(
      fakeAdmin({
        paquetes: [
          { id: "p1", asistente_id: "a1", sesiones_compradas: 10, creado_en: "2026-01-01", cuentas_por_cobrar: cuentaPagada },
        ],
        sesiones: [{ paquete_id: "p1" }, { paquete_id: "p1" }, { paquete_id: "otro" }],
      }),
      ["a1"]
    )

    expect(mapa.get("a1")!.paquetes[0].usadas).toBe(2)
  })

  it("ordena los paquetes del más viejo al más nuevo, que es como se gastan", async () => {
    const mapa = await cargarEstadoCupo(
      fakeAdmin({
        paquetes: [
          { id: "nuevo", asistente_id: "a1", sesiones_compradas: 1, creado_en: "2026-06-01", cuentas_por_cobrar: cuentaPagada },
          { id: "viejo", asistente_id: "a1", sesiones_compradas: 1, creado_en: "2026-01-01", cuentas_por_cobrar: cuentaPagada },
        ],
      }),
      ["a1"]
    )

    expect(mapa.get("a1")!.paquetes.map((p) => p.id)).toEqual(["viejo", "nuevo"])
  })

  it("descuenta del pendiente lo pagado, y no cuenta los pagos anulados", async () => {
    const mapa = await cargarEstadoCupo(
      fakeAdmin({
        paquetes: [
          {
            id: "p1",
            asistente_id: "a1",
            sesiones_compradas: 1,
            creado_en: "2026-01-01",
            cuentas_por_cobrar: {
              concepto: "Sesión",
              valor_total: 278000,
              pagos_abonos: [
                { monto: 100000, estado: "activo" },
                { monto: 50000, estado: "anulado" },
                { monto: 50000, estado: "activo", notas: "[ANULADO] error de digitación" },
              ],
            },
          },
        ],
      }),
      ["a1"]
    )

    expect(mapa.get("a1")!.paquetes[0].pendiente).toBe(178000)
  })

  it("la deuda total suma TODAS las cuentas, no solo las de paquetes", async () => {
    const mapa = await cargarEstadoCupo(
      fakeAdmin({
        paquetes: [],
        cuentas: [
          { asistente_id: "a1", valor_total: 100000, pagos_abonos: [] },
          { asistente_id: "a1", valor_total: 50000, pagos_abonos: [{ monto: 20000, estado: "activo" }] },
        ],
      }),
      ["a1"]
    )

    expect(mapa.get("a1")!.deudaTotal).toBe(130000)
  })

  it("sin personas no consulta nada", async () => {
    expect((await cargarEstadoCupo(fakeAdmin({}), [])).size).toBe(0)
  })

  it("una persona sin paquetes queda con cupo en cero, no ausente", async () => {
    const mapa = await cargarEstadoCupo(fakeAdmin({}), ["a1"])

    expect(mapa.get("a1")).toEqual({ paquetes: [], deudaTotal: 0 })
  })
})
