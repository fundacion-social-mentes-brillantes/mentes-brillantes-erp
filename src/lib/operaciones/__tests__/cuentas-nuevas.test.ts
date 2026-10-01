import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/utils/periodos", () => ({ assertFechaEditable: vi.fn(async () => null) }))
vi.mock("../abonos", () => ({ registrarAbono: vi.fn() }))
vi.mock("../coach", () => ({ registrarSesionCoach: vi.fn() }))

import { assertFechaEditable } from "@/lib/utils/periodos"
import { registrarAbono } from "../abonos"
import { registrarSesionCoach } from "../coach"
import { crearCuentaCompleta, validarCuentaCompleta, validarCuentaNueva } from "../movimientos"
import { supabaseFalso } from "./supabase-falso"

const ACTOR = { userId: "u-1", role: "admin" as const }
const BASE = { asistenteId: "p-1", concepto: "Sesión guía coach - 2 sesiones", fechaEmision: "2026-09-25" }

beforeEach(() => {
  vi.mocked(assertFechaEditable).mockResolvedValue(null)
  vi.mocked(registrarAbono).mockReset()
  vi.mocked(registrarSesionCoach).mockReset()
})

describe("modalidades de una cuenta nueva (las mismas reglas del formulario web)", () => {
  it("una cortesia coach va en 0, nace pagada y lleva la marca [Cortesia]", () => {
    const v = validarCuentaNueva({ ...BASE, valorTotal: 0, sesionesCoach: 2, modalidad: "cortesia" })
    expect(v.valorTotal).toBe(0)
    expect(v.estadoInicial).toBe("pagado")
    expect(v.concepto).toBe("[Cortesia] Sesión guía coach - 2 sesiones")
  })

  it("lo cubierto por otro proceso lleva su propia marca y no se duplica", () => {
    const v = validarCuentaNueva({
      ...BASE,
      concepto: "[Cubierto por otro proceso/familiar] paquete",
      valorTotal: 0,
      sesionesCoach: 1,
      modalidad: "cubierto_por_otro_proceso",
    })
    expect(v.concepto).toBe("[Cubierto por otro proceso/familiar] paquete")
  })

  it("rechaza una cortesia que no es paquete coach", () => {
    expect(() => validarCuentaNueva({ ...BASE, valorTotal: 0, modalidad: "cortesia" })).toThrow(/paquetes coach/)
  })

  it("rechaza una cortesia con valor mayor a 0", () => {
    expect(() =>
      validarCuentaNueva({ ...BASE, valorTotal: 278000, sesionesCoach: 1, modalidad: "cortesia" })
    ).toThrow(/valor 0/)
  })

  it("una cuenta normal sigue exigiendo valor positivo", () => {
    expect(() => validarCuentaNueva({ ...BASE, valorTotal: 0, sesionesCoach: 1 })).toThrow()
    expect(validarCuentaNueva({ ...BASE, valorTotal: 278000 }).estadoInicial).toBe("pendiente")
  })

  it("no admite abono inicial en una cuenta de valor 0", async () => {
    await expect(
      validarCuentaCompleta(supabaseFalso({}), {
        ...BASE,
        valorTotal: 0,
        sesionesCoach: 1,
        modalidad: "cortesia",
        abonoInicial: { monto: 10000, metodoPago: "nequi", fechaPago: "2026-09-25" },
      })
    ).rejects.toThrow(/valor 0/)
  })

  it("calcula el excedente del abono inicial que va a saldo a favor", async () => {
    const plan = await validarCuentaCompleta(supabaseFalso({}), {
      ...BASE,
      valorTotal: 90000,
      abonoInicial: { monto: 100000, metodoPago: "nequi", fechaPago: "2026-09-25" },
    })
    expect(plan.abono).toMatchObject({ montoAplicado: 90000, excedente: 10000 })
    expect(plan.estadoDespues).toBe("pagado")
  })

  it("respeta el periodo cerrado para la fecha del abono", async () => {
    vi.mocked(assertFechaEditable).mockImplementation(async (_s: any, fecha: string) =>
      fecha === "2026-08-01" ? "Periodo cerrado" : null
    )
    await expect(
      validarCuentaCompleta(supabaseFalso({}), {
        ...BASE,
        valorTotal: 90000,
        abonoInicial: { monto: 90000, metodoPago: "nequi", fechaPago: "2026-08-01" },
      })
    ).rejects.toThrow(/Periodo cerrado/)
  })
})

describe("crear la cuenta completa en un solo paso", () => {
  it("crea la cortesia con su paquete y le registra la sesion en ESE paquete", async () => {
    const sb = supabaseFalso({ cuentas_por_cobrar: [], coach_paquetes: [], auditoria_financiera: [] })
    vi.mocked(registrarSesionCoach).mockResolvedValue({
      paqueteId: "coach_paquetes-2",
      cuentaId: "cuentas_por_cobrar-1",
      fecha: "2026-09-25",
      restantesDespues: 1,
    })

    const r = await crearCuentaCompleta(sb, ACTOR, {
      ...BASE,
      valorTotal: 0,
      sesionesCoach: 2,
      modalidad: "cortesia",
      primeraSesion: { fecha: "2026-09-25", eventoAgendaId: "evt-1" },
    })

    const cuenta = sb.tablas.cuentas_por_cobrar[0]
    expect(cuenta).toMatchObject({ valor_total: 0, estado: "pagado", concepto: "[Cortesia] Sesión guía coach - 2 sesiones" })
    expect(sb.tablas.coach_paquetes[0]).toMatchObject({ sesiones_compradas: 2, cuenta_id: cuenta.id })
    expect(registrarSesionCoach).toHaveBeenCalledWith(sb, ACTOR, {
      asistenteId: "p-1",
      fecha: "2026-09-25",
      notas: null,
      eventoAgendaId: "evt-1",
      paqueteId: r.paqueteId,
    })
    expect(registrarAbono).not.toHaveBeenCalled()
    expect(r.estado).toBe("pagado")
  })

  it("si la sesion falla, deshace el pago, el paquete y la cuenta", async () => {
    const sb = supabaseFalso({ cuentas_por_cobrar: [], coach_paquetes: [], auditoria_financiera: [] })
    vi.mocked(registrarAbono).mockResolvedValue({
      pagoId: "pago-9",
      saldoFavorId: null,
      montoAplicado: 150000,
      excedenteASaldoFavor: 0,
      estadoDespues: "pagado",
    })
    vi.mocked(registrarSesionCoach).mockRejectedValue(new Error("sin cupo"))

    await expect(
      crearCuentaCompleta(sb, ACTOR, {
        ...BASE,
        valorTotal: 150000,
        sesionesCoach: 1,
        abonoInicial: { monto: 150000, metodoPago: "nequi", fechaPago: "2026-09-25" },
        primeraSesion: { fecha: "2026-09-26" },
      })
    ).rejects.toThrow("sin cupo")

    const borrados = sb.escrituras.filter((e: any) => e.tipo === "delete").map((e: any) => e.tabla)
    expect(borrados).toEqual(["pagos_abonos", "coach_paquetes", "cuentas_por_cobrar"])
    expect(sb.tablas.cuentas_por_cobrar).toEqual([])
    expect(sb.tablas.coach_paquetes).toEqual([])
  })
})
