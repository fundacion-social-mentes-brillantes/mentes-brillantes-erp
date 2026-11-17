import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/utils/fechas", async (original) => ({
  ...(await original<typeof import("@/lib/utils/fechas")>()),
  fechaHoyBogota: () => "2026-12-20",
}))

import {
  anularRepartoTaller,
  cargarNominaTaller,
  quitarAdelantoTaller,
  registrarAdelantoTaller,
  repartirTaller,
} from "../talleres-nomina"
import { calcularRepartoTaller } from "../talleres-reglas"
import { supabaseFalso } from "./supabase-falso"

// La nomina de cada taller: su plata va aparte de la fundacion y se reparte
// entre los socios activos con sus porcentajes.

const ADMIN = { userId: "11111111-2222-3333-4444-555555555555", role: "admin" as const }
const CAJA = { userId: "66666666-7777-8888-9999-000000000000", role: "caja" as const }

const SOCIOS = [
  { id: "s-ale", nombre: "Alexandra Ortega", porcentaje_participacion: 40, activo: true },
  { id: "s-val", nombre: "Valeria lopez", porcentaje_participacion: 30, activo: true },
  { id: "s-seb", nombre: "Sebastian lopez", porcentaje_participacion: 30, activo: true },
  { id: "s-viejo", nombre: "Socio de antes", porcentaje_participacion: 0, activo: false },
]

// Como la base: guarda el reparto y su detalle de una vez, y no deja repartir dos veces lo mismo.
function guardarReparto(args: Record<string, any>, tablas: Record<string, any[]>) {
  const activos = (tablas.talleres_repartos ?? []).filter((r) => r.taller_id === args.p_taller_id && r.estado === "activo")
  const repartido = activos.reduce((t, r) => t + Number(r.utilidad), 0)
  if (repartido !== Number(args.p_repartido_antes)) {
    return { error: { message: "Mientras tanto se repartió este taller: vuelve a mirar lo que queda por repartir." } }
  }
  const id = `r-${(tablas.talleres_repartos ?? []).length + 1}`
  tablas.talleres_repartos = [
    ...(tablas.talleres_repartos ?? []),
    {
      id,
      taller_id: args.p_taller_id,
      fecha: args.p_fecha,
      recaudado: args.p_recaudado,
      gastos: args.p_gastos,
      repartido_antes: args.p_repartido_antes,
      utilidad: args.p_utilidad,
      notas: args.p_notas,
      estado: "activo",
      motivo_anulacion: null,
      creado_en: `2026-12-2${(tablas.talleres_repartos ?? []).length}T00:00:00Z`,
    },
  ]
  tablas.talleres_repartos_socios = [
    ...(tablas.talleres_repartos_socios ?? []),
    ...(args.p_socios as any[]).map((s) => ({
      reparto_id: id,
      socio_id: s.socio_id,
      porcentaje: s.porcentaje,
      valor_correspondiente: s.valor_correspondiente,
      adelantos_descontados: s.adelantos_descontados,
      valor_neto: s.valor_neto,
    })),
  ]
  return { data: id }
}

function base(extra: Record<string, any[]> = {}) {
  return supabaseFalso(
    {
      talleres: [{ id: "t-1", nombre: "Cena de la Gratitud 2026", slug: "gratitud-2026", precio: 120000, preguntas: [] }],
      taller_inscripciones: [
        { id: "i-1", taller_id: "t-1", nombre: "Ana", valor_acordado: 120000, estado: "inscrito", asistio: false, creado_en: "1" },
        { id: "i-2", taller_id: "t-1", nombre: "Luis", valor_acordado: 120000, estado: "inscrito", asistio: false, creado_en: "2" },
      ],
      ventas_externas: [
        { id: "v-1", taller_inscripcion_id: "i-1", monto: 120000, metodo_pago: "nequi", fecha: "2026-11-01" },
        { id: "v-2", taller_inscripcion_id: "i-2", monto: 60000, metodo_pago: "nequi", fecha: "2026-11-02" },
        { id: "v-3", taller_inscripcion_id: "i-2", monto: 60000, metodo_pago: "nequi", fecha: "2026-11-02", estado: "anulado" },
      ],
      egresos: [{ id: "e-1", taller_id: "t-1", concepto: "Refrigerios", monto: 30000, fecha: "2026-11-05" }],
      socios: SOCIOS.map((s) => ({ ...s })),
      talleres_repartos: [],
      talleres_repartos_socios: [],
      adelantos_socios: [],
      medios_pago: [{ clave: "efectivo", nombre: "Efectivo", activo: true, orden: 10 }, { clave: "nequi", nombre: "Nequi", activo: true, orden: 20 }],
      ...extra,
    },
    { rpc: { fn_guardar_reparto_taller: guardarReparto } }
  )
}

describe("cuánto le toca a cada socio", () => {
  it("lo recaudado menos los gastos se reparte con los porcentajes", () => {
    const r = calcularRepartoTaller({
      recaudado: 840000,
      gastos: 0,
      repartido: 0,
      socios: [
        { id: "a", nombre: "Alexandra", porcentaje: 40 },
        { id: "v", nombre: "Valeria", porcentaje: 30 },
        { id: "s", nombre: "Sebastián", porcentaje: 30 },
      ],
    })
    expect(r.porRepartir).toBe(840000)
    expect(r.filas.map((f) => f.valor)).toEqual([336000, 252000, 252000])
  })

  it("solo reparte lo nuevo, descuenta los adelantos y no reparte números negativos", () => {
    const socios = [{ id: "a", nombre: "A", porcentaje: 50 }, { id: "b", nombre: "B", porcentaje: 50 }]
    const r = calcularRepartoTaller({ recaudado: 300000, gastos: 50000, repartido: 150000, socios, adelantosPendientes: { a: 20000 } })
    expect(r.porRepartir).toBe(100000)
    expect(r.filas).toMatchObject([
      { socioId: "a", valor: 50000, adelantos: 20000, neto: 30000 },
      { socioId: "b", valor: 50000, adelantos: 0, neto: 50000 },
    ])
    const enRojo = calcularRepartoTaller({ recaudado: 10000, gastos: 50000, repartido: 0, socios })
    expect(enRojo.porRepartir).toBe(-40000)
    expect(enRojo.filas.every((f) => f.valor === 0)).toBe(true)
  })
})

describe("la nómina de un taller", () => {
  it("cuenta lo recaudado (sin lo anulado), los gastos, lo que se debe y la propuesta para los socios activos", async () => {
    const nomina = (await cargarNominaTaller(base(), "t-1"))!
    expect(nomina).toMatchObject({ recaudado: 180000, gastos: 30000, repartido: 0, porRepartir: 150000, porCobrar: 60000 })
    expect(nomina.propuesta.map((f) => [f.nombre, f.valor])).toEqual([
      ["Alexandra Ortega", 60000],
      ["Sebastian lopez", 45000],
      ["Valeria lopez", 45000],
    ])
  })

  it("repartir lo deja anotado con su detalle y en la auditoría; después no queda nada por repartir", async () => {
    const sb = base()
    const r = await repartirTaller(sb, ADMIN, "t-1", { notas: "Cierre de la cena" })
    expect(r.utilidad).toBe(150000)
    expect(sb.tablas.talleres_repartos).toHaveLength(1)
    expect(sb.tablas.talleres_repartos_socios).toHaveLength(3)
    expect(sb.tablas.auditoria_financiera[0]).toMatchObject({ accion: "repartir_taller", valor_nuevo: 150000 })
    await expect(repartirTaller(sb, ADMIN, "t-1")).rejects.toThrow(/No hay nada por repartir/)
  })

  it("los pagos que llegan después del cierre quedan por repartir, y el segundo reparto se lleva solo eso", async () => {
    const sb = base()
    await repartirTaller(sb, ADMIN, "t-1")
    sb.tablas.ventas_externas.push({ id: "v-4", taller_inscripcion_id: "i-2", monto: 60000, metodo_pago: "nequi", fecha: "2026-12-30" })
    const nomina = (await cargarNominaTaller(sb, "t-1"))!
    expect(nomina).toMatchObject({ repartido: 150000, porRepartir: 60000, porCobrar: 0 })
    const segundo = await repartirTaller(sb, ADMIN, "t-1")
    expect(segundo.filas.map((f) => f.valor)).toEqual([24000, 18000, 18000])
  })

  it("un adelanto a cuenta del taller se descuenta en el reparto, una sola vez", async () => {
    const sb = base()
    await registrarAdelantoTaller(sb, ADMIN, { tallerId: "t-1", socioId: "s-val", monto: 20000, metodoPago: "nequi" })
    expect(sb.tablas.adelantos_socios[0]).toMatchObject({ taller_id: "t-1", periodo_id: null, monto: 20000, metodo_pago: "nequi" })
    const r = await repartirTaller(sb, ADMIN, "t-1")
    expect(r.filas.find((f) => f.socioId === "s-val")).toMatchObject({ valor: 45000, adelantos: 20000, neto: 25000 })

    sb.tablas.ventas_externas.push({ id: "v-4", taller_inscripcion_id: "i-2", monto: 60000, metodo_pago: "nequi", fecha: "2026-12-30" })
    const nomina = (await cargarNominaTaller(sb, "t-1"))!
    expect(nomina.propuesta.find((f) => f.socioId === "s-val")).toMatchObject({ adelantos: 0 })
  })

  it("un adelanto se puede quitar mientras no se haya descontado", async () => {
    const sb = base()
    const a = await registrarAdelantoTaller(sb, ADMIN, { tallerId: "t-1", socioId: "s-ale", monto: 10000 })
    await quitarAdelantoTaller(sb, ADMIN, a.id)
    expect(sb.tablas.adelantos_socios).toHaveLength(0)

    const b = await registrarAdelantoTaller(sb, ADMIN, { tallerId: "t-1", socioId: "s-ale", monto: 10000 })
    await repartirTaller(sb, ADMIN, "t-1")
    await expect(quitarAdelantoTaller(sb, ADMIN, b.id)).rejects.toThrow(/ya se descontó/)
  })

  it("anular un reparto devuelve lo repartido y sus adelantos a pendientes, con su motivo", async () => {
    const sb = base()
    await registrarAdelantoTaller(sb, ADMIN, { tallerId: "t-1", socioId: "s-seb", monto: 5000 })
    const r = await repartirTaller(sb, ADMIN, "t-1")
    await expect(anularRepartoTaller(sb, ADMIN, r.id, "")).rejects.toThrow(/por qué/)
    await anularRepartoTaller(sb, ADMIN, r.id, "Se repartió antes de tiempo")
    const nomina = (await cargarNominaTaller(sb, "t-1"))!
    expect(nomina).toMatchObject({ repartido: 0, porRepartir: 150000 })
    expect(nomina.adelantosPendientes["s-seb"]).toBe(5000)
    expect(sb.tablas.talleres_repartos[0]).toMatchObject({ estado: "anulado", motivo_anulacion: "Se repartió antes de tiempo" })
    await expect(anularRepartoTaller(sb, ADMIN, r.id, "otra vez")).rejects.toThrow(/ya está anulado/)
  })

  it("todo lo de la nómina es solo del admin", async () => {
    const sb = base()
    await expect(repartirTaller(sb, CAJA, "t-1")).rejects.toThrow(/administrador/)
    await expect(registrarAdelantoTaller(sb, CAJA, { tallerId: "t-1", socioId: "s-ale", monto: 1 })).rejects.toThrow(/administrador/)
  })
})
