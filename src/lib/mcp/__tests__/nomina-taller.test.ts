import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/utils/periodos", () => ({ assertFechaEditable: vi.fn(async () => null) }))

import { OPERACIONES_TALLERES } from "../escritura/talleres"
import { supabaseFalso } from "../../operaciones/__tests__/supabase-falso"

// Las acciones del conector para la nomina de un taller (repartir, anular, adelanto).

const op = (nombre: string) => OPERACIONES_TALLERES.find((o) => o.nombre === nombre)!
const ADMIN = { userId: "11111111-2222-3333-4444-555555555555", role: "admin" as const, email: "admin@x" }

function guardarReparto(args: Record<string, any>, tablas: Record<string, any[]>) {
  const id = `${(tablas.talleres_repartos ?? []).length + 1}1111111-1111-4111-8111-111111111111`.slice(0, 36)
  tablas.talleres_repartos = [
    ...(tablas.talleres_repartos ?? []),
    { id, taller_id: args.p_taller_id, fecha: args.p_fecha, utilidad: args.p_utilidad, recaudado: args.p_recaudado, gastos: args.p_gastos, estado: "activo", creado_en: "x" },
  ]
  tablas.talleres_repartos_socios = [
    ...(tablas.talleres_repartos_socios ?? []),
    ...(args.p_socios as any[]).map((s) => ({ reparto_id: id, socio_id: s.socio_id, porcentaje: s.porcentaje, valor_correspondiente: s.valor_correspondiente, adelantos_descontados: s.adelantos_descontados, valor_neto: s.valor_neto })),
  ]
  return { data: id }
}

function base() {
  return supabaseFalso(
    {
      talleres: [{ id: "t-1", nombre: "Cena de la Gratitud 2026", slug: "gratitud-2026", precio: 120000, estado: "cerrado", preguntas: [], fecha_inicio: "2026-12-18" }],
      taller_inscripciones: [{ id: "i-1", taller_id: "t-1", nombre: "Ana", valor_acordado: 120000, estado: "inscrito", asistio: true, creado_en: "1" }],
      ventas_externas: [{ id: "v-1", taller_inscripcion_id: "i-1", monto: 120000, metodo_pago: "nequi", fecha: "2026-11-01" }],
      egresos: [],
      socios: [
        { id: "s-ale", nombre: "Alexandra Ortega", porcentaje_participacion: 40, activo: true },
        { id: "s-val", nombre: "Valeria lopez", porcentaje_participacion: 30, activo: true },
        { id: "s-seb", nombre: "Sebastian lopez", porcentaje_participacion: 30, activo: true },
      ],
      talleres_repartos: [],
      talleres_repartos_socios: [],
      adelantos_socios: [],
      medios_pago: [{ clave: "efectivo", nombre: "Efectivo", activo: true, orden: 10 }, { clave: "nequi", nombre: "Nequi", activo: true, orden: 20 }],
    },
    { rpc: { fn_guardar_reparto_taller: guardarReparto } }
  )
}

describe("nómina de un taller por el conector", () => {
  it("adelanto_taller: el borrador dice a cuenta de qué taller; al confirmar queda sin periodo de la fundación", async () => {
    const sb = base()
    const borrador = await op("adelanto_taller").previsualizar(sb, ADMIN, { taller: "gratitud-2026", socio: "Valeria", monto: 20000, metodo_pago: "nequi" })
    expect(borrador.resumen).toMatch(/Adelanto de .*20\.000 a Valeria lopez a cuenta de «Cena de la Gratitud 2026»/)
    expect(sb.escrituras).toHaveLength(0)
    await op("adelanto_taller").ejecutar(sb, ADMIN, borrador.datos)
    expect(sb.tablas.adelantos_socios[0]).toMatchObject({ socio_id: "s-val", taller_id: "t-1", periodo_id: null, monto: 20000 })
  })

  it("repartir_taller: el borrador muestra lo de cada socio (con su adelanto) y al confirmar queda anotado", async () => {
    const sb = base()
    sb.tablas.adelantos_socios.push({ id: "a-1", socio_id: "s-val", taller_id: "t-1", periodo_id: null, monto: 20000, fecha: "2026-11-10", metodo_pago: "nequi" })
    const borrador = await op("repartir_taller").previsualizar(sb, ADMIN, { taller: "gratitud-2026" })
    expect(borrador.detalle).toMatchObject({ recaudado: 120000, se_reparte: 120000 })
    expect(borrador.detalle.socios).toEqual([
      { socio: "Alexandra Ortega", porcentaje: 40, su_parte: 48000, adelantos: 0, a_entregar: 48000 },
      { socio: "Sebastian lopez", porcentaje: 30, su_parte: 36000, adelantos: 0, a_entregar: 36000 },
      { socio: "Valeria lopez", porcentaje: 30, su_parte: 36000, adelantos: 20000, a_entregar: 16000 },
    ])
    expect(sb.escrituras.filter((e: { tipo: string }) => e.tipo !== "rpc")).toHaveLength(0)
    const hecho = await op("repartir_taller").ejecutar(sb, ADMIN, borrador.datos)
    expect(hecho).toMatchObject({ repartido: 120000 })
    await expect(op("repartir_taller").previsualizar(sb, ADMIN, { taller: "gratitud-2026" })).rejects.toThrow(/nada por repartir/)
  })

  it("anular_reparto_taller: vuelve a quedar por repartir", async () => {
    const sb = base()
    const borrador = await op("repartir_taller").previsualizar(sb, ADMIN, { taller: "gratitud-2026" })
    const hecho = await op("repartir_taller").ejecutar(sb, ADMIN, borrador.datos)
    const anular = await op("anular_reparto_taller").previsualizar(sb, ADMIN, { reparto_id: hecho.reparto_id, motivo: "Se repartió antes de tiempo" })
    expect(anular.resumen).toMatch(/Anular el reparto de .*120\.000/)
    await op("anular_reparto_taller").ejecutar(sb, ADMIN, anular.datos)
    const otra = await op("repartir_taller").previsualizar(sb, ADMIN, { taller: "gratitud-2026" })
    expect(otra.detalle).toMatchObject({ se_reparte: 120000 })
  })
})
