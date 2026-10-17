import { describe, expect, it } from "vitest"
import { armarProceso, fechaDeSello, fechaLarga, primerNombre, telefonoWhatsApp } from "./proceso"

describe("fechas de la pagina", () => {
  it("se escriben como se dicen", () => {
    expect(fechaLarga("2026-10-17")).toBe("17 de octubre")
    expect(fechaLarga("2026-03-03", true)).toBe("3 de marzo de 2026")
    expect(fechaDeSello("2026-09-05")).toEqual({ dia: "5", mes: "sep" })
  })
})

const cuenta = (concepto: string, valor: number, pagos: number[] = [], anulados: number[] = []) => ({
  concepto,
  valor_total: valor,
  pagos_abonos: [
    ...pagos.map((monto) => ({ monto, estado: "activo", notas: null })),
    ...anulados.map((monto) => ({ monto, estado: "anulado", notas: "[ANULADO] error" })),
  ],
})

describe("armarProceso", () => {
  const proceso = armarProceso({
    nombre: "  LAURA gómez ",
    fechaInicioProceso: null,
    cuentas: [
      cuenta("Paquete de 24 sesiones", 1200000, [500000, 400000]),
      cuenta("sesion coach", 50000, [50000]),
      cuenta("Sesión  coach", 50000, [50000]),
      cuenta("sesion coach", 50000, [], [50000]), // el pago anulado no cuenta: falta todo
      cuenta("Taller del mes, octubre", 80000),
    ],
    paquetes: [
      { id: "p2", sesiones_compradas: 24, creado_en: "2026-03-03", coach_sesiones: [{ fecha: "2026-03-10" }, { fecha: "2026-03-03" }] },
      { id: "p1", sesiones_compradas: 1, creado_en: "2026-02-01", coach_sesiones: [{ fecha: "2026-02-20" }] },
    ],
  })

  it("saluda por el primer nombre", () => {
    expect(proceso.nombre).toBe("LAURA gómez")
    expect(proceso.primerNombre).toBe("Laura")
  })

  it("suma lo pagado y lo que falta sin contar pagos anulados", () => {
    expect(proceso.totalPagado).toBe(1000000)
    expect(proceso.totalFalta).toBe(300000 + 50000 + 80000)
    expect(proceso.cuentasPagadas).toBe(2)
  })

  it("agrupa los conceptos repetidos aunque cambien tildes o espacios, y muestra la forma con tilde", () => {
    expect(proceso.pagadas).toEqual([{ concepto: "Sesión coach", cantidad: 2, total: 100000, pagado: 100000, falta: 0 }])
  })

  it("muestra primero lo que mas falta", () => {
    expect(proceso.pendientes.map((g) => [g.concepto, g.falta])).toEqual([
      ["Paquete de 24 sesiones", 300000],
      ["Taller del mes, octubre", 80000],
      ["Sesion coach", 50000],
    ])
  })

  it("cuenta las sesiones como el resto del ERP y las ordena por fecha", () => {
    expect(proceso.tomadas).toBe(3)
    expect(proceso.porTomar).toBe(22)
    expect(proceso.sesiones).toEqual(["2026-02-20", "2026-03-03", "2026-03-10"])
    expect(proceso.desde).toBe("2026-02-20")
  })

  it("si la ficha tiene fecha de inicio de proceso, manda esa", () => {
    const otro = armarProceso({ nombre: "Ana", fechaInicioProceso: "2026-01-15", cuentas: [], paquetes: [] })
    expect(otro.desde).toBe("2026-01-15")
    expect(otro.pendientes).toEqual([])
    expect(otro.tomadas).toBe(0)
  })
})

describe("primerNombre", () => {
  it("toma la primera palabra con mayuscula inicial", () => {
    expect(primerNombre("maría josé PÉREZ")).toBe("María")
    expect(primerNombre("")).toBe("")
  })
})

describe("telefonoWhatsApp", () => {
  it("le pone el 57 a los celulares de Colombia", () => {
    expect(telefonoWhatsApp("310 555 1234")).toBe("573105551234")
    expect(telefonoWhatsApp("+57 310-555-1234")).toBe("573105551234")
  })

  it("deja los internacionales como vienen y descarta los que no sirven", () => {
    expect(telefonoWhatsApp("+1 305 555 0101")).toBe("13055550101")
    expect(telefonoWhatsApp("6012345")).toBeNull()
    expect(telefonoWhatsApp(null)).toBeNull()
  })
})
