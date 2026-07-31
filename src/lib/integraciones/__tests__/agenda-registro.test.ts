import { describe, expect, it } from "vitest"
import { eventosYaEnElErp, pasarSesionDeAgendaAlErp } from "../agenda-registro"

// Supabase falso: guarda lo insertado para poder afirmar que NO se escribe nada
// cuando la persona no tiene cupo. Es la garantia importante de este modulo.
function fakeAdmin(opts: {
  persona?: { id: string; nombre: string; codigo: string } | null
  paquetes?: any[]
  sesionesExistentes?: any[]
}) {
  const insertados: Array<{ tabla: string; filas: any[] }> = []

  const client: any = {
    insertados,
    from(tabla: string) {
      const filtros: Record<string, unknown> = {}

      const resolver = async () => {
        if (tabla === "asistentes") return { data: opts.persona ?? null, error: null }
        if (tabla === "coach_paquetes") return { data: opts.paquetes ?? [], error: null }
        if (tabla === "coach_sesiones") return { data: opts.sesionesExistentes ?? [], error: null }
        return { data: [], error: null }
      }

      const q: any = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filtros[col] = val
          return q
        },
        in: () => q,
        is: () => q,
        update: () => q,
        limit: () => resolver(),
        maybeSingle: () => resolver(),
        insert: (filas: any[]) => {
          insertados.push({ tabla, filas })
          return Promise.resolve({ error: null })
        },
        then: (res: any, rej: any) => resolver().then(res, rej),
      }
      return q
    },
  }
  return client
}

const PERSONA = { id: "p-1", nombre: "Marcela Sanchez", codigo: "211" }
const paquete = (compradas: number, usadas: number) => ({
  id: "paq-1",
  cuenta_id: "c-1",
  sesiones_compradas: compradas,
  creado_en: "2026-07-01T00:00:00Z",
  coach_sesiones: Array.from({ length: usadas }, (_, i) => ({ id: `s${i}` })),
  cuentas_por_cobrar: { concepto: "Sesión guía coach - 1 sesiones" },
})

describe("pasarSesionDeAgendaAlErp", () => {
  it("con cupo registra la sesión y la enlaza al evento de la agenda", async () => {
    const admin = fakeAdmin({ persona: PERSONA, paquetes: [paquete(3, 1)] })

    const r: any = await pasarSesionDeAgendaAlErp(admin, {
      codigo: "211",
      fecha: "2026-07-29",
      eventoAgendaId: "evt-abc",
    })

    expect(r.estado).toBe("registrada")
    const insertada = admin.insertados.find((x: any) => x.tabla === "coach_sesiones")
    expect(insertada.filas[0].evento_agenda_id).toBe("evt-abc")
    expect(insertada.filas[0].fecha).toBe("2026-07-29")
  })

  // Lo que el boton de la agenda tiene que poder decir sin escribir nada.
  it("sin cupo avisa y NO escribe en la contabilidad", async () => {
    const admin = fakeAdmin({ persona: PERSONA, paquetes: [paquete(2, 2)] })

    const r: any = await pasarSesionDeAgendaAlErp(admin, { codigo: "211", fecha: "2026-07-29" })

    expect(r.estado).toBe("sin_cupo")
    expect(r.mensaje).toContain("no tiene sesiones disponibles")
    expect(r.detalle).toContain("Compró 2 y ya tomó 2")
    expect(admin.insertados).toHaveLength(0)
  })

  it("sin ningún paquete lo dice con esas palabras, no habla de cupo agotado", async () => {
    const admin = fakeAdmin({ persona: PERSONA, paquetes: [] })

    const r: any = await pasarSesionDeAgendaAlErp(admin, { codigo: "211", fecha: "2026-07-29" })

    expect(r.estado).toBe("sin_cupo")
    expect(r.detalle).toContain("No tiene ningún paquete coach comprado")
    expect(admin.insertados).toHaveLength(0)
  })

  it("si ya estaba registrada no la duplica", async () => {
    const admin = fakeAdmin({
      persona: PERSONA,
      paquetes: [paquete(5, 1)],
      sesionesExistentes: [{ id: "ses-vieja", fecha: "2026-07-29" }],
    })

    const r: any = await pasarSesionDeAgendaAlErp(admin, { codigo: "211", fecha: "2026-07-29" })

    expect(r.estado).toBe("ya_estaba")
    expect(admin.insertados).toHaveLength(0)
  })

  it("con un código que el ERP no conoce no inventa la persona", async () => {
    const admin = fakeAdmin({ persona: null })

    const r: any = await pasarSesionDeAgendaAlErp(admin, { codigo: "999", fecha: "2026-07-29" })

    expect(r.estado).toBe("persona_desconocida")
    expect(admin.insertados).toHaveLength(0)
  })

  it("rechaza una fecha con formato raro antes de tocar la base", async () => {
    const admin = fakeAdmin({ persona: PERSONA, paquetes: [paquete(5, 0)] })

    await expect(pasarSesionDeAgendaAlErp(admin, { codigo: "211", fecha: "29/07/2026" })).rejects.toThrow()
    expect(admin.insertados).toHaveLength(0)
  })
})

/**
 * Supabase falso para la consulta que pinta el botón. Distingue las tres
 * consultas de coach_sesiones por lo que piden en el select, y anota los
 * update para poder afirmar que el enlace se rellena.
 */
function fakeConsulta(opts: { sesiones?: any[]; personas?: any[] }) {
  const actualizados: Array<{ id: string; eventoId: string }> = []

  const client: any = {
    actualizados,
    from(tabla: string) {
      let seleccion = ""
      let cambios: any = null
      const filtros: Record<string, unknown> = {}

      const resolver = async () => {
        if (cambios) {
          actualizados.push({ id: String(filtros.id), eventoId: cambios.evento_agenda_id })
          return { data: null, error: null }
        }
        if (tabla === "asistentes") return { data: opts.personas ?? [], error: null }
        if (tabla === "coach_sesiones") {
          const todas = opts.sesiones ?? []
          // La primera consulta solo pide el enlace: se responde con las que lo tienen.
          if (seleccion === "evento_agenda_id") {
            return { data: todas.filter((s: any) => s.evento_agenda_id), error: null }
          }
          return { data: todas, error: null }
        }
        return { data: [], error: null }
      }

      const q: any = {
        select: (cols: string) => {
          seleccion = cols
          return q
        },
        update: (v: any) => {
          cambios = v
          return q
        },
        eq: (col: string, val: unknown) => {
          filtros[col] = val
          return q
        },
        in: () => q,
        is: () => q,
        limit: () => resolver(),
        maybeSingle: () => resolver(),
        then: (res: any, rej: any) => resolver().then(res, rej),
      }
      return q
    },
  }
  return client
}

describe("eventosYaEnElErp", () => {
  it("reconoce el evento por su enlace directo", async () => {
    const admin = fakeConsulta({ sesiones: [{ id: "s1", evento_agenda_id: "evt-1" }] })

    expect(await eventosYaEnElErp(admin, ["evt-1"])).toEqual(["evt-1"])
  })

  // El caso del dueño: registra en el ERP y la sesión queda sin enlace.
  it("reconoce una sesión registrada en el ERP, sin enlace, por persona y fecha", async () => {
    const admin = fakeConsulta({
      personas: [{ id: "p-1", codigo: "211" }],
      sesiones: [{ id: "s1", asistente_id: "p-1", fecha: "2026-07-29", evento_agenda_id: null }],
    })

    const r = await eventosYaEnElErp(admin, [{ id: "evt-1", codigo: "211", fecha: "2026-07-29" }])

    expect(r).toEqual(["evt-1"])
  })

  it("aprovecha y rellena el enlace que faltaba, para que el verde no se pierda", async () => {
    const admin = fakeConsulta({
      personas: [{ id: "p-1", codigo: "211" }],
      sesiones: [{ id: "s1", asistente_id: "p-1", fecha: "2026-07-29", evento_agenda_id: null }],
    })

    await eventosYaEnElErp(admin, [{ id: "evt-1", codigo: "211", fecha: "2026-07-29" }])

    expect(admin.actualizados).toEqual([{ id: "s1", eventoId: "evt-1" }])
  })

  it("no marca como registrado un día en el que la persona no tuvo sesión", async () => {
    const admin = fakeConsulta({
      personas: [{ id: "p-1", codigo: "211" }],
      sesiones: [{ id: "s1", asistente_id: "p-1", fecha: "2026-07-29", evento_agenda_id: null }],
    })

    const r = await eventosYaEnElErp(admin, [{ id: "evt-2", codigo: "211", fecha: "2026-08-05" }])

    expect(r).toEqual([])
    expect(admin.actualizados).toHaveLength(0)
  })

  it("sin código ni fecha se comporta como antes: solo el enlace directo", async () => {
    const admin = fakeConsulta({
      personas: [{ id: "p-1", codigo: "211" }],
      sesiones: [{ id: "s1", asistente_id: "p-1", fecha: "2026-07-29", evento_agenda_id: null }],
    })

    expect(await eventosYaEnElErp(admin, ["evt-1"])).toEqual([])
  })
})
