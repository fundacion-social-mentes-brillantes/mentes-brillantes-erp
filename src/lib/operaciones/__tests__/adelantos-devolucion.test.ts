import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/utils/periodos", () => ({
  assertPeriodoAbierto: vi.fn(),
  assertNoPeriodOverlap: vi.fn(async () => null),
}))

import { assertPeriodoAbierto } from "@/lib/utils/periodos"
import {
  crearDevolucionAdelanto,
  crearDevolucionSocio,
  planearDevolucionSocio,
  validarDevolucionAdelanto,
} from "../administracion"

// Cuando el socio regresa plata de un adelanto, eso NO es un ingreso del
// negocio: es el mismo adelanto bajando. Se guarda como movimiento negativo del
// adelanto original, y de ahi sale que el cierre lo descuente solo. Estas
// pruebas fijan justo eso: el signo, el tope y quien puede.

const ACTOR = { userId: "user-1", role: "admin" as const }

const PERIODO = {
  id: "per-1",
  nombre: "Agosto 2026",
  fecha_inicio: "2026-08-01",
  fecha_fin: "2026-08-31",
  estado: "abierto",
}

const ADELANTO = {
  id: "ade-1",
  socio_id: "socio-1",
  periodo_id: "per-1",
  monto: 500000,
  fecha: "2026-08-03",
  tipo: "adelanto",
}

function fakeSupabase(
  adelanto: any,
  devolucionesPrevias: any[] = [],
  opts: { fallaInsert?: boolean; fallaLeerDevoluciones?: boolean } = {}
) {
  const insertados: Array<{ tabla: string; filas: any[] }> = []

  const client = {
    insertados,
    from(tabla: string) {
      const q: any = {
        _columna: "",
        select: () => q,
        eq: (columna: string) => {
          q._columna = columna
          return q
        },
        single: async () =>
          adelanto ? { data: adelanto, error: null } : { data: null, error: { message: "no existe" } },
        // Las devoluciones previas se leen sin single: se espera la lista.
        then: (resolver: any) =>
          resolver(
            opts.fallaLeerDevoluciones
              ? { data: null, error: { message: "fallo" } }
              : { data: devolucionesPrevias, error: null }
          ),
        insert(filas: any[]) {
          insertados.push({ tabla, filas })
          return {
            select: () => ({
              single: async () =>
                opts.fallaInsert
                  ? { data: null, error: { message: "no se pudo" } }
                  : { data: { id: "dev-1" }, error: null },
            }),
            then: (resolver: any) => resolver({ error: null }),
          }
        },
      }
      return q
    },
  }

  return client as any
}

const datos = (over: Partial<Parameters<typeof crearDevolucionAdelanto>[2]> = {}) => ({
  adelantoId: "ade-1",
  monto: 200000,
  fecha: "2026-08-10",
  metodoPago: "nequi",
  ...over,
})

beforeEach(() => {
  vi.mocked(assertPeriodoAbierto).mockResolvedValue({ error: null, periodo: PERIODO } as any)
})

describe("devolución de un adelanto", () => {
  // El corazon del diseño: el signo va dentro del monto, para que toda suma de
  // adelantos (incluido el cierre) lo descuente sin tocar nada mas.
  it("se guarda como movimiento negativo del mismo adelanto", async () => {
    const supabase = fakeSupabase(ADELANTO)

    const resultado = await crearDevolucionAdelanto(supabase, ACTOR, datos())

    const fila = supabase.insertados.find((i: any) => i.tabla === "adelantos_socios")?.filas[0]
    expect(fila.monto).toBe(-200000)
    expect(fila.tipo).toBe("devolucion")
    expect(fila.adelanto_id).toBe("ade-1")
    expect(fila.periodo_id).toBe("per-1")
    expect(fila.socio_id).toBe("socio-1")
    expect(fila.metodo_pago).toBe("nequi")
    expect(resultado.pendienteDespues).toBe(300000)
    expect(resultado.quedaDevueltoCompleto).toBe(false)
  })

  it("acepta devolver por partes y suma lo ya devuelto", async () => {
    const supabase = fakeSupabase(ADELANTO, [{ monto: -300000 }])

    const v = await validarDevolucionAdelanto(supabase, datos({ monto: 100000 }))

    expect(v.devuelto).toBe(300000)
    expect(v.pendiente).toBe(200000)
  })

  it("no deja devolver más de lo que queda del adelanto", async () => {
    const supabase = fakeSupabase(ADELANTO, [{ monto: -400000 }])

    await expect(crearDevolucionAdelanto(supabase, ACTOR, datos({ monto: 200000 }))).rejects.toThrow(
      /quedan \$100\.000/
    )
    expect(supabase.insertados).toHaveLength(0)
  })

  it("devolver justo lo que queda cierra el adelanto", async () => {
    const supabase = fakeSupabase(ADELANTO, [{ monto: -400000 }])

    const resultado = await crearDevolucionAdelanto(supabase, ACTOR, datos({ monto: 100000 }))

    expect(resultado.pendienteDespues).toBe(0)
    expect(resultado.quedaDevueltoCompleto).toBe(true)
  })

  it("un adelanto ya devuelto completo no admite otra devolución", async () => {
    const supabase = fakeSupabase(ADELANTO, [{ monto: -500000 }])

    await expect(crearDevolucionAdelanto(supabase, ACTOR, datos({ monto: 1000 }))).rejects.toThrow(
      /ya esta devuelto/
    )
  })

  it("un periodo cerrado no admite devoluciones", async () => {
    vi.mocked(assertPeriodoAbierto).mockResolvedValue({
      error: "El periodo Agosto 2026 esta cerrado.",
      periodo: null,
    } as any)
    const supabase = fakeSupabase(ADELANTO)

    await expect(crearDevolucionAdelanto(supabase, ACTOR, datos())).rejects.toThrow(/cerrado/)
    expect(supabase.insertados).toHaveLength(0)
  })

  // Si la fecha se sale del periodo, el cierre la suma por fecha y el descuento
  // por periodo_id dejarian de coincidir.
  it("la fecha tiene que caer dentro del periodo", async () => {
    const supabase = fakeSupabase(ADELANTO)

    await expect(
      crearDevolucionAdelanto(supabase, ACTOR, datos({ fecha: "2026-09-02" }))
    ).rejects.toThrow(/dentro del periodo Agosto 2026/)
  })

  it("no se devuelve una devolución", async () => {
    const supabase = fakeSupabase({ ...ADELANTO, tipo: "devolucion", monto: -200000 })

    await expect(crearDevolucionAdelanto(supabase, ACTOR, datos())).rejects.toThrow(
      /ya es una devolucion/
    )
  })

  it("exige un monto mayor a cero", async () => {
    const supabase = fakeSupabase(ADELANTO)

    await expect(crearDevolucionAdelanto(supabase, ACTOR, datos({ monto: 0 }))).rejects.toThrow(
      /mayor a 0/
    )
  })

  it("si no encuentra el adelanto no inventa nada", async () => {
    const supabase = fakeSupabase(null)

    await expect(crearDevolucionAdelanto(supabase, ACTOR, datos())).rejects.toThrow(
      /No se encontro ese adelanto/
    )
  })

  it("si no puede leer las devoluciones previas, no arriesga pasarse del tope", async () => {
    const supabase = fakeSupabase(ADELANTO, [], { fallaLeerDevoluciones: true })

    await expect(crearDevolucionAdelanto(supabase, ACTOR, datos())).rejects.toThrow(
      /no se pudieron leer las devoluciones/i
    )
  })

  it("queda auditada con lo que quedaba antes y después", async () => {
    const supabase = fakeSupabase(ADELANTO, [{ monto: -100000 }])

    await crearDevolucionAdelanto(supabase, ACTOR, datos({ monto: 150000 }))

    const auditoria = supabase.insertados.find((i: any) => i.tabla === "auditoria_financiera")?.filas[0]
    expect(auditoria.accion).toBe("devolver_adelanto")
    expect(auditoria.valor_anterior).toBe(400000)
    expect(auditoria.valor_nuevo).toBe(250000)
    expect(auditoria.usuario_id).toBe("user-1")
  })
})

// Lo normal en la vida real: varios micro-adelantos y despues UN pago que los
// cubre en parte o del todo. Nadie deberia tener que decidir a mano cual paga
// primero, y menos hacer la resta.
describe("devolución repartida entre los adelantos del socio", () => {
  const MOVIMIENTOS = [
    { id: "ade-1", monto: 100000, fecha: "2026-08-03", tipo: "adelanto", adelanto_id: null },
    { id: "ade-2", monto: 20000, fecha: "2026-08-05", tipo: "adelanto", adelanto_id: null },
    { id: "ade-3", monto: 7000, fecha: "2026-08-09", tipo: "adelanto", adelanto_id: null },
  ]

  function adminConAdelantos(movimientos: any[], opts: { sinPeriodo?: boolean } = {}) {
    const insertados: Array<{ tabla: string; filas: any[] }> = []

    const client = {
      insertados,
      from(tabla: string) {
        const q: any = {
          select: () => q,
          eq: () => q,
          limit: () => q,
          then: (resolver: any) =>
            resolver(
              tabla === "periodos"
                ? { data: opts.sinPeriodo ? [] : [PERIODO], error: null }
                : { data: movimientos, error: null }
            ),
          insert(filas: any[]) {
            insertados.push({ tabla, filas })
            const respuesta = { data: filas.map((_, i) => ({ id: `dev-${i + 1}` })), error: null }
            return {
              select: () => ({ then: (resolver: any) => resolver(respuesta) }),
              then: (resolver: any) => resolver({ error: null }),
            }
          },
        }
        return q
      },
    }
    return client as any
  }

  const datosSocio = (monto: number) => ({
    socioId: "socio-1",
    monto,
    fecha: "2026-08-14",
    metodoPago: "nequi",
  })

  it("un pago chico sale del adelanto más viejo", async () => {
    const plan = await planearDevolucionSocio(adminConAdelantos(MOVIMIENTOS), datosSocio(50000))

    expect(plan.reparto).toHaveLength(1)
    expect(plan.reparto[0].fechaAdelanto).toBe("2026-08-03")
    expect(plan.reparto[0].seAplica).toBe(50000)
    expect(plan.totalPendienteDespues).toBe(77000)
  })

  it("un pago grande se reparte en cascada, del más viejo al más nuevo", async () => {
    const plan = await planearDevolucionSocio(adminConAdelantos(MOVIMIENTOS), datosSocio(115000))

    expect(plan.reparto.map((p) => [p.fechaAdelanto, p.seAplica])).toEqual([
      ["2026-08-03", 100000],
      ["2026-08-05", 15000],
    ])
    expect(plan.totalPendienteDespues).toBe(12000)
    expect(plan.quedaTodoSaldado).toBe(false)
  })

  it("pagar todo deja al socio al día", async () => {
    const plan = await planearDevolucionSocio(adminConAdelantos(MOVIMIENTOS), datosSocio(127000))

    expect(plan.reparto).toHaveLength(3)
    expect(plan.totalPendienteDespues).toBe(0)
    expect(plan.quedaTodoSaldado).toBe(true)
  })

  it("cuenta lo ya devuelto antes de repartir", async () => {
    const conDevolucion = [...MOVIMIENTOS, { id: "dev-x", monto: -90000, fecha: "2026-08-10", tipo: "devolucion", adelanto_id: "ade-1" }]

    const plan = await planearDevolucionSocio(adminConAdelantos(conDevolucion), datosSocio(15000))

    // Del primer adelanto solo quedaban 10.000; los otros 5.000 pasan al segundo.
    expect(plan.reparto.map((p) => [p.fechaAdelanto, p.seAplica])).toEqual([
      ["2026-08-03", 10000],
      ["2026-08-05", 5000],
    ])
  })

  it("no deja devolver más de lo que se le adelantó", async () => {
    await expect(
      planearDevolucionSocio(adminConAdelantos(MOVIMIENTOS), datosSocio(200000))
    ).rejects.toThrow(/solo quedan \$127\.000/)
  })

  it("si no debe nada, lo dice en vez de inventar un movimiento", async () => {
    await expect(planearDevolucionSocio(adminConAdelantos([]), datosSocio(1000))).rejects.toThrow(
      /no tiene adelantos por devolver/
    )
  })

  it("sin periodo abierto no se registra nada", async () => {
    await expect(
      planearDevolucionSocio(adminConAdelantos(MOVIMIENTOS, { sinPeriodo: true }), datosSocio(1000))
    ).rejects.toThrow(/No hay ningun periodo abierto/)
  })

  it("la fecha tiene que caer dentro del periodo", async () => {
    await expect(
      planearDevolucionSocio(adminConAdelantos(MOVIMIENTOS), { ...datosSocio(1000), fecha: "2026-09-30" })
    ).rejects.toThrow(/dentro del periodo/)
  })

  // Las filas entran en UN insert: media devolucion aplicada seria peor que
  // ninguna.
  it("guarda todas las partes en un solo insert, con el signo negativo", async () => {
    const admin = adminConAdelantos(MOVIMIENTOS)

    const resultado = await crearDevolucionSocio(admin, ACTOR, datosSocio(115000))

    const escrituras = admin.insertados.filter((i: any) => i.tabla === "adelantos_socios")
    expect(escrituras).toHaveLength(1)
    expect(escrituras[0].filas.map((f: any) => f.monto)).toEqual([-100000, -15000])
    expect(escrituras[0].filas.every((f: any) => f.tipo === "devolucion")).toBe(true)
    expect(escrituras[0].filas.map((f: any) => f.adelanto_id)).toEqual(["ade-1", "ade-2"])
    expect(resultado.adelantosTocados).toBe(2)
  })

  it("audita cada parte del reparto", async () => {
    const admin = adminConAdelantos(MOVIMIENTOS)

    await crearDevolucionSocio(admin, ACTOR, datosSocio(115000))

    const auditoria = admin.insertados.find((i: any) => i.tabla === "auditoria_financiera")?.filas
    expect(auditoria).toHaveLength(2)
    expect(auditoria[0].accion).toBe("devolver_adelanto")
    expect(auditoria[0].valor_nuevo).toBe(0)
    expect(auditoria[1].valor_nuevo).toBe(5000)
    expect(auditoria[1].motivo).toContain("parte de un pago de $115.000")
  })
})
