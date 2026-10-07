import { beforeEach, describe, expect, it, vi } from "vitest"

const guardarSnapshotAgendaMock = vi.fn()
const calcularDiferenciasMock = vi.fn()
const pasarSesionMock = vi.fn()
const eventosYaEnElErpMock = vi.fn()
const estadoFinancieroMock = vi.fn()
const sesionesCoachMock = vi.fn()

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: "p1", nombre: "Ana", codigo: "5", activo: true }, error: null }),
        }),
      }),
    }),
  }),
}))
vi.mock("@/lib/operaciones/agenda-sync", () => ({
  guardarSnapshotAgenda: (...a: unknown[]) => guardarSnapshotAgendaMock(...a),
  calcularDiferencias: (...a: unknown[]) => calcularDiferenciasMock(...a),
}))
vi.mock("@/lib/integraciones/agenda-registro", () => ({
  pasarSesionDeAgendaAlErp: (...a: unknown[]) => pasarSesionMock(...a),
  eventosYaEnElErp: (...a: unknown[]) => eventosYaEnElErpMock(...a),
}))
vi.mock("@/lib/telegram-cajero/tools", () => ({
  getPersonFinancialStatus: (...a: unknown[]) => estadoFinancieroMock(...a),
}))
vi.mock("@/lib/telegram-cajero/tools/coach", () => ({
  getCoachSessions: (...a: unknown[]) => sesionesCoachMock(...a),
}))

const { POST: sincronizar } = await import("../sincronizar/route")
const { POST: registrar } = await import("../registrar-sesion/route")
const { GET: personas } = await import("../personas/route")

const SECRETO = "secreto-de-prueba-largo"
const pedir = (url: string, cuerpo?: unknown, secreto: string | null = SECRETO) =>
  new Request(url, {
    method: cuerpo === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(secreto ? { "x-agenda-secret": secreto } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AGENDA_SHARED_SECRET = SECRETO
  guardarSnapshotAgendaMock.mockResolvedValue({ guardados: 0 })
  calcularDiferenciasMock.mockResolvedValue([])
})

describe("rutas de la agenda", () => {
  it("sin la clave compartida no deja pasar a ninguna", async () => {
    for (const respuesta of [
      await sincronizar(pedir("http://x/api/integraciones/agenda/sincronizar", {}, null)),
      await registrar(pedir("http://x/api/integraciones/agenda/registrar-sesion", {}, "otra")),
      await personas(pedir("http://x/api/integraciones/agenda/personas?codigos=5", undefined, null)),
    ]) {
      expect(respuesta.status).toBe(401)
    }
    expect(guardarSnapshotAgendaMock).not.toHaveBeenCalled()
    expect(pasarSesionMock).not.toHaveBeenCalled()
  })

  it("sincronizar ignora eventos con codigo vacio o no numerico (antes '' pasaba como 0)", async () => {
    await sincronizar(
      pedir("http://x/api/integraciones/agenda/sincronizar", {
        workspaceId: "w1",
        desde: "2026-10-01",
        hasta: "2026-10-31",
        eventos: [
          { id: "e1", clientCode: "211", date: "2026-10-02", clientName: "Marcela" },
          { id: "e2", clientCode: "", date: "2026-10-03" },
          { id: "e3", clientCode: "abc", date: "2026-10-04" },
          { id: "e4", clientCode: 0, date: "2026-10-05" },
          { id: "e5", codigoPersona: 9, date: "2026-10-06" },
        ],
      })
    )

    const { eventos } = guardarSnapshotAgendaMock.mock.calls[0][1]
    expect(eventos.map((e: { id: string; codigoPersona: number }) => [e.id, e.codigoPersona])).toEqual([
      ["e1", 211],
      ["e5", 9],
    ])
  })

  it("registrar sin codigo o sin fecha contesta 400 y no escribe", async () => {
    const r = await registrar(pedir("http://x/api/integraciones/agenda/registrar-sesion", { codigo: "5" }))
    expect(r.status).toBe(400)
    expect(pasarSesionMock).not.toHaveBeenCalled()
  })

  it("personas: si la lectura financiera falla no da cifras y avisa que no esta completa", async () => {
    estadoFinancieroMock.mockResolvedValue({ status: "error", data: null })
    sesionesCoachMock.mockResolvedValue({ status: "ok", data: { sesiones_compradas: 2, sesiones_realizadas: 1, sesiones_restantes: 1 } })

    const r = await personas(pedir("http://x/api/integraciones/agenda/personas?codigos=5"))
    const cuerpo = await r.json()

    expect(cuerpo.personas[0].deuda_total).toBeNull()
    expect(cuerpo.personas[0].completo).toBe(false)
    expect(cuerpo.personas[0].coach.sesiones_restantes).toBe(1)
  })
})
