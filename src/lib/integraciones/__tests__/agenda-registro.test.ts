import { describe, expect, it } from "vitest"
import { pasarSesionDeAgendaAlErp } from "../agenda-registro"

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
