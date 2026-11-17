import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/utils/periodos", () => ({ assertFechaEditable: vi.fn(async () => null) }))

import { OPERACIONES_TALLERES } from "../escritura/talleres"
import { supabaseFalso } from "../../operaciones/__tests__/supabase-falso"

// La accion del conector para cambiar los datos de una inscripcion: sobre todo,
// pasar un cupo regalado (ya pagado) a otra persona sin tocar sus pagos.

const editar = OPERACIONES_TALLERES.find((o) => o.nombre === "editar_inscripcion_taller")!
const ADMIN = { userId: "11111111-2222-3333-4444-555555555555", role: "admin" as const, email: "admin@x" }
const CAJA = { userId: "66666666-7777-8888-9999-000000000000", role: "caja" as const, email: "caja@x" }

const CENA = {
  id: "t-1",
  nombre: "Cena de la Gratitud 2026",
  slug: "gratitud-2026",
  precio: 120000,
  precio_nino_con_kit: 60000,
  precio_nino_sin_kit: 0,
  estado: "abierto",
  fecha_inicio: "2026-12-18T23:00:00Z",
  preguntas: [],
}

function inscripcion(extra: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    taller_id: "t-1",
    nombre: "Edwin Valencia Cuadrado",
    documento: "TI1020304050",
    edad: 12,
    kit: true,
    telefono: "3001234567",
    correo: null,
    notas: null,
    asistente_id: null,
    valor_acordado: 60000,
    estado: "inscrito",
    asistio: false,
    hora_llegada: null,
    creado_en: "2026-11-01T10:00:00Z",
    ...extra,
  }
}

const PAGO = { id: "v-1", taller_inscripcion_id: "11111111-1111-4111-8111-111111111111", monto: 60000, metodo_pago: "nequi", fecha: "2026-11-02" }

function base(extra: Record<string, unknown> = {}, pagos = [PAGO]) {
  return supabaseFalso({ talleres: [CENA], taller_inscripciones: [inscripcion(extra)], ventas_externas: pagos.map((p) => ({ ...p })) })
}

describe("editar_inscripcion_taller", () => {
  it("pasa un cupo regalado y pagado a otra persona: los pagos se quedan y el valor no cambia", async () => {
    const sb = base()
    const borrador = await editar.previsualizar(sb, ADMIN, {
      taller: "gratitud-2026",
      persona: "Edwin",
      nombre: "Sara Sánchez",
      cedula: "TI1099887766",
      edad: 8,
      kit: true,
    })
    expect(borrador.resumen).toBe("Pasar la inscripción de Edwin Valencia Cuadrado a Sara Sánchez en «Cena de la Gratitud 2026» (los pagos se quedan)")
    expect(borrador.detalle).toMatchObject({
      antes: { nombre: "Edwin Valencia Cuadrado", edad: "12 años", identificacion: "••••4050" },
      despues: { nombre: "Sara Sánchez", edad: "8 años", identificacion: "••••7766" },
      ya_pago: 60000,
      valor_a_pagar: 60000,
      falta_despues: 0,
    })
    expect(borrador.avisos?.[0]).toMatch(/pagos se quedan.*ya pagó \$/)
    expect(sb.escrituras).toHaveLength(0)

    const hecho = await editar.ejecutar(sb, ADMIN, borrador.datos)
    expect(hecho).toMatchObject({ nombre: "Sara Sánchez", edad: "8 años", kit: "Con kit", valor_a_pagar: 60000 })
    expect(sb.tablas.taller_inscripciones[0]).toMatchObject({ nombre: "Sara Sánchez", documento: "TI1099887766", edad: 8, kit: true })
    expect(sb.tablas.ventas_externas).toEqual([PAGO])
  })

  it("si a un niño le cambian el kit, el borrador ya dice el valor nuevo, y queda así", async () => {
    const sb = base({ kit: false, valor_acordado: 0 }, [])
    const borrador = await editar.previsualizar(sb, CAJA, { taller: "gratitud-2026", persona: "Edwin", kit: true })
    expect(borrador.detalle).toMatchObject({ valor_a_pagar: { antes: 0, despues: 60000 }, falta_despues: 60000 })
    expect(borrador.avisos?.some((a) => /El valor a pagar pasa de \$\s?0 a \$\s?60\.000/.test(a ?? ""))).toBe(true)
    await editar.ejecutar(sb, CAJA, borrador.datos)
    expect(sb.tablas.taller_inscripciones[0]).toMatchObject({ kit: true, valor_acordado: 60000 })
  })

  it("no deja que el valor quede por debajo de lo ya pagado", async () => {
    const sb = base()
    await expect(editar.previsualizar(sb, ADMIN, { taller: "gratitud-2026", persona: "Edwin", kit: false })).rejects.toThrow(
      /Ya pagó \$60\.000/
    )
  })

  it("el valor a mano solo lo pone el admin, como en la web", async () => {
    await expect(
      editar.previsualizar(base(), CAJA, { taller: "gratitud-2026", persona: "Edwin", valor_acordado: 30000 })
    ).rejects.toThrow(/administrador/)
  })

  it("avisa cuando no hay nada que cambiar y no edita una inscripción cancelada", async () => {
    await expect(editar.previsualizar(base(), ADMIN, { taller: "gratitud-2026", persona: "Edwin", edad: 12 })).rejects.toThrow(
      /nada que cambiar/
    )
    await expect(
      editar.previsualizar(base({ estado: "cancelado" }), ADMIN, { taller: "gratitud-2026", persona: "Edwin", nombre: "Otra" })
    ).rejects.toThrow(/cancelada/)
  })

  it("si el cupo pasa a otra persona y estaba enlazada a una ficha del ERP, avisa; con «ninguna» quita el enlace", async () => {
    const sb = base({ asistente_id: "a-36" })
    const sinQuitar = await editar.previsualizar(sb, ADMIN, { taller: "gratitud-2026", persona: "Edwin", nombre: "Sara Sánchez" })
    expect(sinQuitar.avisos?.some((a) => a?.includes("«ninguna»"))).toBe(true)

    const quitando = await editar.previsualizar(sb, ADMIN, {
      taller: "gratitud-2026",
      persona: "Edwin",
      nombre: "Sara Sánchez",
      persona_erp: "ninguna",
    })
    expect(quitando.detalle).toMatchObject({ enlace_erp: "se quita" })
    await editar.ejecutar(sb, ADMIN, quitando.datos)
    expect(sb.tablas.taller_inscripciones[0]).toMatchObject({ nombre: "Sara Sánchez", asistente_id: null })
  })
})
