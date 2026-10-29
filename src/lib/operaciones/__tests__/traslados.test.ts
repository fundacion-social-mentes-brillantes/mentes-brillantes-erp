import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/utils/periodos", () => ({ assertFechaEditable: vi.fn(async () => null) }))

import { assertFechaEditable } from "@/lib/utils/periodos"
import { olvidarMedios } from "@/lib/medios-pago"
import { anularTraslado, listarTraslados, registrarTraslado, validarTraslado } from "../traslados"
import { supabaseFalso } from "./supabase-falso"

const ADMIN = { userId: "11111111-2222-3333-4444-555555555555", role: "admin" as const }

const MEDIOS = [
  { clave: "efectivo", nombre: "Efectivo", activo: true, orden: 10 },
  { clave: "nequi", nombre: "Nequi", activo: true, orden: 20 },
  { clave: "daviplata", nombre: "Daviplata", activo: true, orden: 30 },
  { clave: "banco_caja_social", nombre: "Banco Caja Social", activo: true, orden: 40 },
  { clave: "otro", nombre: "Otro", activo: true, orden: 90 },
]

const base = (extra: Record<string, any[]> = {}) =>
  supabaseFalso({ medios_pago: MEDIOS.map((m) => ({ ...m })), traslados_cuentas: [], ...extra })

beforeEach(() => {
  olvidarMedios()
  vi.mocked(assertFechaEditable).mockResolvedValue(null)
})

describe("traslados entre cuentas", () => {
  it("pasa plata de Nequi al Banco Caja Social y lo deja en la auditoria", async () => {
    const supabase = base()
    const r = await registrarTraslado(supabase, ADMIN, {
      monto: 50000,
      origen: "nequi",
      destino: "banco_caja_social",
      fecha: "2026-10-29",
      notas: "Consignación",
    })

    expect(r.descripcion).toBe("Nequi → Banco Caja Social")
    expect(supabase.tablas.traslados_cuentas).toHaveLength(1)
    expect(supabase.tablas.traslados_cuentas[0]).toMatchObject({
      monto: 50000,
      metodo_origen: "nequi",
      metodo_destino: "banco_caja_social",
      fecha: "2026-10-29",
      usuario_id: ADMIN.userId,
    })
    expect(supabase.tablas.auditoria_financiera[0]).toMatchObject({ accion: "crear_traslado", valor_nuevo: 50000 })
  })

  it("entiende el nombre de la cuenta, con o sin tildes y mayúsculas", async () => {
    const t = await validarTraslado(base(), {
      monto: 1000,
      origen: "NEQUI",
      destino: "banco caja social",
      fecha: "2026-10-29",
    })
    expect(t.origen).toBe("nequi")
    expect(t.destino).toBe("banco_caja_social")
  })

  it("no deja trasladar a la misma cuenta", async () => {
    await expect(
      validarTraslado(base(), { monto: 1000, origen: "nequi", destino: "Nequi", fecha: "2026-10-29" })
    ).rejects.toThrow(/distintas/)
  })

  it("no acepta cuentas que no existen ni el saldo a favor", async () => {
    await expect(
      validarTraslado(base(), { monto: 1000, origen: "bitcoin", destino: "nequi", fecha: "2026-10-29" })
    ).rejects.toThrow(/no sirve/)
    await expect(
      validarTraslado(base(), { monto: 1000, origen: "saldo_a_favor", destino: "nequi", fecha: "2026-10-29" })
    ).rejects.toThrow(/no sirve/)
  })

  it("una cuenta que el admin acaba de agregar ya sirve", async () => {
    const supabase = base()
    supabase.tablas.medios_pago.push({ clave: "bancolombia", nombre: "Bancolombia", activo: true, orden: 50 })
    const t = await validarTraslado(supabase, { monto: 1000, origen: "efectivo", destino: "Bancolombia", fecha: "2026-10-29" })
    expect(t.destino).toBe("bancolombia")
  })

  it("rechaza montos en cero y fechas de un periodo cerrado", async () => {
    await expect(
      validarTraslado(base(), { monto: 0, origen: "nequi", destino: "efectivo", fecha: "2026-10-29" })
    ).rejects.toThrow()
    vi.mocked(assertFechaEditable).mockResolvedValueOnce("El periodo está cerrado.")
    await expect(
      registrarTraslado(base(), ADMIN, { monto: 1000, origen: "nequi", destino: "efectivo", fecha: "2026-01-02" })
    ).rejects.toThrow(/cerrado/)
  })

  it("anular no borra: lo marca anulado, con su motivo, y queda en la auditoria", async () => {
    const supabase = base({
      traslados_cuentas: [
        { id: "tr-1", fecha: "2026-10-29", monto: 50000, metodo_origen: "nequi", metodo_destino: "banco_caja_social", estado: "activo", notas: null },
      ],
    })
    await anularTraslado(supabase, ADMIN, "tr-1", "Se registró dos veces")

    expect(supabase.tablas.traslados_cuentas[0]).toMatchObject({
      estado: "anulado",
      motivo_anulacion: "Se registró dos veces",
      anulado_por: ADMIN.userId,
    })
    expect(supabase.tablas.auditoria_financiera[0]).toMatchObject({ accion: "anular_traslado", valor_anterior: 50000 })
    await expect(anularTraslado(supabase, ADMIN, "tr-1", "otra vez")).rejects.toThrow(/ya está anulado/)
  })

  it("para anular hay que decir por qué", async () => {
    const supabase = base({
      traslados_cuentas: [
        { id: "tr-1", fecha: "2026-10-29", monto: 50000, metodo_origen: "nequi", metodo_destino: "efectivo", estado: "activo" },
      ],
    })
    await expect(anularTraslado(supabase, ADMIN, "tr-1", " ")).rejects.toThrow(/por qué/)
  })

  it("lista los más recientes primero, filtrando por fechas", async () => {
    const supabase = base({
      traslados_cuentas: [
        { id: "a", fecha: "2026-09-01", monto: 1, metodo_origen: "nequi", metodo_destino: "efectivo", estado: "activo", creado_en: "1" },
        { id: "b", fecha: "2026-10-05", monto: 2, metodo_origen: "nequi", metodo_destino: "efectivo", estado: "activo", creado_en: "2" },
        { id: "c", fecha: "2026-10-20", monto: 3, metodo_origen: "nequi", metodo_destino: "efectivo", estado: "anulado", creado_en: "3" },
      ],
    })
    const lista = await listarTraslados(supabase, { desde: "2026-10-01" })
    expect(lista.map((t) => t.id)).toEqual(["c", "b"])
  })
})
