import { beforeEach, describe, expect, it, vi } from "vitest"
import { OperacionError, previsualizarAbono, registrarAbono } from "../abonos"

vi.mock("@/lib/utils/periodos", () => ({
  assertFechaEditable: vi.fn(async () => null),
}))

import { assertFechaEditable } from "@/lib/utils/periodos"

const ACTOR = { userId: "user-1", role: "admin" as const }

type Escrito = { tabla: string; filas: any[] }

/**
 * Supabase falso: registra lo insertado/actualizado/borrado para poder afirmar
 * exactamente que asientos contables se generaron.
 */
function fakeSupabase(cuenta: any, opts: { fallaSaldoFavor?: boolean; fallaUpdateCuenta?: boolean } = {}) {
  const insertados: Escrito[] = []
  const actualizados: Escrito[] = []
  const borrados: Array<{ tabla: string; id: string }> = []
  let seq = 0

  const client = {
    insertados,
    actualizados,
    borrados,
    from(tabla: string) {
      const q: any = {
        select: () => q,
        eq: (_c: string, v: string) => {
          q._id = v
          return q
        },
        single: async () => {
          if (tabla === "cuentas_por_cobrar") return { data: cuenta, error: null }
          return { data: null, error: null }
        },
        insert(filas: any[]) {
          insertados.push({ tabla, filas })
          const falla = tabla === "movimientos_saldo_favor" && opts.fallaSaldoFavor
          return {
            select: () => ({
              single: async () =>
                falla
                  ? { data: null, error: { message: "fallo saldo" } }
                  : { data: { id: `${tabla}-${++seq}` }, error: null },
            }),
            then: (res: any) => res({ error: null }),
          }
        },
        update(cambios: any) {
          actualizados.push({ tabla, filas: [cambios] })
          return {
            eq: async () => ({
              error: opts.fallaUpdateCuenta && tabla === "cuentas_por_cobrar" ? { message: "fallo update" } : null,
            }),
          }
        },
        delete() {
          return {
            eq: async (_c: string, id: string) => {
              borrados.push({ tabla, id })
              return { error: null }
            },
          }
        },
      }
      return q
    },
  }
  return client as any
}

function cuentaBase(valorTotal: number, pagos: any[] = []) {
  return {
    valor_total: valorTotal,
    estado: "pendiente",
    asistente_id: "asis-1",
    concepto: "primer paso",
    asistentes: { nombre: "Ana Prueba" },
    pagos_abonos: pagos,
  }
}

describe("registrarAbono: reglas contables", () => {
  beforeEach(() => {
    vi.mocked(assertFechaEditable).mockResolvedValue(null as any)
  })

  it("rechaza montos que no son mayores a 0", async () => {
    const db = fakeSupabase(cuentaBase(100000))
    await expect(
      registrarAbono(db, ACTOR, { cuentaId: "c1", monto: 0, metodoPago: "efectivo", fechaPago: "2026-07-10", notas: null })
    ).rejects.toBeInstanceOf(OperacionError)
    expect(db.insertados).toHaveLength(0)
  })

  it("rechaza si la fecha cae en un periodo cerrado", async () => {
    vi.mocked(assertFechaEditable).mockResolvedValue("El periodo esta cerrado." as any)
    const db = fakeSupabase(cuentaBase(100000))
    await expect(
      registrarAbono(db, ACTOR, { cuentaId: "c1", monto: 1000, metodoPago: "efectivo", fechaPago: "2026-01-10", notas: null })
    ).rejects.toThrow("El periodo esta cerrado.")
    expect(db.insertados).toHaveLength(0)
  })

  it("abono parcial: registra el pago y deja la cuenta en parcial", async () => {
    const db = fakeSupabase(cuentaBase(100000))
    const res = await registrarAbono(db, ACTOR, {
      cuentaId: "c1", monto: 40000, metodoPago: "efectivo", fechaPago: "2026-07-10", notas: null,
    })

    expect(res.montoAplicado).toBe(40000)
    expect(res.excedenteASaldoFavor).toBe(0)
    expect(res.estadoDespues).toBe("parcial")
    const pagos = db.insertados.filter((e: Escrito) => e.tabla === "pagos_abonos")
    expect(pagos).toHaveLength(1)
    expect(pagos[0].filas[0]).toMatchObject({ monto: 40000, origen_fondos: "pago_directo", usuario_id: "user-1" })
    expect(db.insertados.some((e: Escrito) => e.tabla === "movimientos_saldo_favor")).toBe(false)
  })

  it("abono exacto: deja la cuenta pagada", async () => {
    const db = fakeSupabase(cuentaBase(100000))
    const res = await registrarAbono(db, ACTOR, {
      cuentaId: "c1", monto: 100000, metodoPago: "nequi", fechaPago: "2026-07-10", notas: null,
    })
    expect(res.montoAplicado).toBe(100000)
    expect(res.estadoDespues).toBe("pagado")
  })

  it("SOBREPAGO: el excedente va a saldo a favor marcado con [ABONO:id], no se pierde", async () => {
    const db = fakeSupabase(cuentaBase(100000))
    const res = await registrarAbono(db, ACTOR, {
      cuentaId: "c1", monto: 150000, metodoPago: "efectivo", fechaPago: "2026-07-10", notas: null,
    })

    expect(res.montoAplicado).toBe(100000)
    expect(res.excedenteASaldoFavor).toBe(50000)
    expect(res.estadoDespues).toBe("pagado")

    const saldo = db.insertados.find((e: Escrito) => e.tabla === "movimientos_saldo_favor")
    expect(saldo).toBeDefined()
    expect(saldo!.filas[0]).toMatchObject({ tipo: "ingreso", monto: 50000, asistente_id: "asis-1" })
    expect(saldo!.filas[0].notas).toContain(`[ABONO:${res.pagoId}]`)
  })

  it("cuenta ya pagada: no crea pago, todo el dinero va a saldo a favor", async () => {
    const db = fakeSupabase(cuentaBase(100000, [{ id: "p0", monto: 100000, estado: "activo", origen_fondos: "pago_directo" }]))
    const res = await registrarAbono(db, ACTOR, {
      cuentaId: "c1", monto: 30000, metodoPago: "efectivo", fechaPago: "2026-07-10", notas: null,
    })

    expect(res.montoAplicado).toBe(0)
    expect(res.pagoId).toBeNull()
    expect(res.excedenteASaldoFavor).toBe(30000)
    expect(db.insertados.some((e: Escrito) => e.tabla === "pagos_abonos")).toBe(false)
  })

  it("ignora pagos anulados al calcular el pendiente", async () => {
    const db = fakeSupabase(
      cuentaBase(100000, [{ id: "p0", monto: 100000, estado: "anulado", notas: "[ANULADO] x", origen_fondos: "pago_directo" }])
    )
    const res = await registrarAbono(db, ACTOR, {
      cuentaId: "c1", monto: 100000, metodoPago: "efectivo", fechaPago: "2026-07-10", notas: null,
    })
    expect(res.montoAplicado).toBe(100000)
    expect(res.excedenteASaldoFavor).toBe(0)
  })

  it("revierte el pago si falla el registro del saldo a favor", async () => {
    const db = fakeSupabase(cuentaBase(100000), { fallaSaldoFavor: true })
    await expect(
      registrarAbono(db, ACTOR, { cuentaId: "c1", monto: 150000, metodoPago: "efectivo", fechaPago: "2026-07-10", notas: null })
    ).rejects.toBeInstanceOf(OperacionError)
    expect(db.borrados.some((b) => b.tabla === "pagos_abonos")).toBe(true)
  })

  it("revierte todo si falla la consolidacion de la cuenta", async () => {
    const db = fakeSupabase(cuentaBase(100000), { fallaUpdateCuenta: true })
    await expect(
      registrarAbono(db, ACTOR, { cuentaId: "c1", monto: 150000, metodoPago: "efectivo", fechaPago: "2026-07-10", notas: null })
    ).rejects.toThrow(/revirtio/i)
    expect(db.borrados.some((b) => b.tabla === "pagos_abonos")).toBe(true)
    expect(db.borrados.some((b) => b.tabla === "movimientos_saldo_favor")).toBe(true)
  })

  it("deja auditoria del abono", async () => {
    const db = fakeSupabase(cuentaBase(100000))
    await registrarAbono(db, ACTOR, {
      cuentaId: "c1", monto: 40000, metodoPago: "efectivo", fechaPago: "2026-07-10", notas: "foto whatsapp",
    })
    const audit = db.insertados.find((e: Escrito) => e.tabla === "auditoria_financiera")
    expect(audit).toBeDefined()
    expect(audit!.filas[0]).toMatchObject({ accion: "crear_abono", valor_nuevo: 40000, usuario_id: "user-1" })
  })
})

describe("previsualizarAbono: el borrador que se muestra antes de confirmar", () => {
  beforeEach(() => {
    vi.mocked(assertFechaEditable).mockResolvedValue(null as any)
  })

  it("calcula el antes y despues sin escribir nada", async () => {
    const db = fakeSupabase(cuentaBase(100000, [{ id: "p0", monto: 30000, estado: "activo", origen_fondos: "pago_directo" }]))
    const prev = await previsualizarAbono(db, {
      cuentaId: "c1", monto: 40000, metodoPago: "efectivo", fechaPago: "2026-07-10", notas: null,
    })

    expect(prev.personaNombre).toBe("Ana Prueba")
    expect(prev.pendienteAntes).toBe(70000)
    expect(prev.montoAplicado).toBe(40000)
    expect(prev.pendienteDespues).toBe(30000)
    expect(prev.estadoDespues).toBe("parcial")
    expect(db.insertados).toHaveLength(0)
    expect(db.actualizados).toHaveLength(0)
  })

  it("avisa del excedente que iria a saldo a favor", async () => {
    const db = fakeSupabase(cuentaBase(100000))
    const prev = await previsualizarAbono(db, {
      cuentaId: "c1", monto: 120000, metodoPago: "efectivo", fechaPago: "2026-07-10", notas: null,
    })
    expect(prev.excedenteASaldoFavor).toBe(20000)
    expect(prev.pendienteDespues).toBe(0)
    expect(db.insertados).toHaveLength(0)
  })
})
