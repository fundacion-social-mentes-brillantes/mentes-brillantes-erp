import { describe, expect, it } from "vitest"
import { guardarSnapshotAgenda, resumenEspejoAgenda, type EventoAgenda } from "../agenda-sync"

// El caso que motivo estas pruebas (12 de agosto de 2026): la agenda reporto la
// ventana entera pero su lista venia recortada en el 31 de julio, y el ERP dio
// por borradas las tres sesiones coach de agosto. Un evento marcado como
// borrado ya no se compara, asi que esas sesiones se habrian dictado sin que
// nadie avisara que faltaba cobrarlas.

type Llamada = { op: string; filtros: Record<string, unknown>; payload?: unknown }

function crearAdmin(
  opciones: {
    alBorrar?: { data?: unknown[] | null; error?: unknown }
    alGuardar?: { error?: unknown }
    alLeer?: (columnas: string) => { data?: unknown[] | null; error?: unknown }
  } = {}
) {
  const llamadas: Llamada[] = []

  function encadenable(registro: Llamada, resultado: unknown) {
    const api: any = {
      then: (resolver: any, rechazar: any) => Promise.resolve(resultado).then(resolver, rechazar),
    }
    for (const metodo of ["eq", "gte", "lte", "not", "order", "limit", "select"]) {
      api[metodo] = (...args: unknown[]) => {
        registro.filtros[`${metodo}:${String(args[0] ?? "")}`] = args[1] ?? true
        return api
      }
    }
    return api
  }

  const admin = {
    llamadas,
    from: (tabla: string) => ({
      upsert: (filas: unknown[]) => {
        const registro: Llamada = { op: `upsert:${tabla}`, filtros: {}, payload: filas }
        llamadas.push(registro)
        return encadenable(registro, opciones.alGuardar ?? { error: null })
      },
      update: (cambios: unknown) => {
        const registro: Llamada = { op: `update:${tabla}`, filtros: {}, payload: cambios }
        llamadas.push(registro)
        return encadenable(registro, opciones.alBorrar ?? { data: [], error: null })
      },
      select: (columnas: string) => {
        const registro: Llamada = { op: `select:${tabla}`, filtros: { columnas } }
        llamadas.push(registro)
        return encadenable(registro, opciones.alLeer?.(columnas) ?? { data: [], error: null })
      },
    }),
  }

  return admin
}

const evento = (over: Partial<EventoAgenda> = {}): EventoAgenda => ({
  id: "ev1",
  workspaceId: "w1",
  codigoPersona: 5,
  nombrePersona: "Luz Miriam Garzon",
  fecha: "2026-07-31",
  ...over,
})

const ventana = { desde: "2026-06-28", hasta: "2026-08-27" }

describe("guardarSnapshotAgenda", () => {
  it("guarda lo reportado", async () => {
    const admin = crearAdmin()

    const resultado = await guardarSnapshotAgenda(admin as any, {
      workspaceId: "w1",
      ...ventana,
      eventos: [evento()],
    })

    expect(resultado.recibidos).toBe(1)
    expect(admin.llamadas.some((l) => l.op === "upsert:agenda_eventos")).toBe(true)
  })

  // El bug: la lista llegaba cortada y el ERP leia el corte como un borrado.
  it("no da por borrado nada mas alla de la ultima fecha reportada", async () => {
    const admin = crearAdmin()

    const resultado = await guardarSnapshotAgenda(admin as any, {
      workspaceId: "w1",
      ...ventana,
      eventos: [evento({ fecha: "2026-07-23" }), evento({ id: "ev2", fecha: "2026-07-31" })],
    })

    expect(resultado.ventanaBarrida).toEqual({ desde: "2026-06-28", hasta: "2026-07-31" })
    const barrido = admin.llamadas.find((l) => l.op === "update:agenda_eventos")
    expect(barrido?.filtros["lte:fecha"]).toBe("2026-07-31")
  })

  it("un reporte recortado no autoriza a borrar", async () => {
    const admin = crearAdmin()

    const resultado = await guardarSnapshotAgenda(admin as any, {
      workspaceId: "w1",
      ...ventana,
      eventos: [evento()],
      reporteCompleto: false,
    })

    expect(resultado.sinBarrer).toBe("reporte_incompleto")
    expect(resultado.ventanaBarrida).toBeNull()
    expect(admin.llamadas.some((l) => l.op === "update:agenda_eventos")).toBe(false)
  })

  // Antes, un reporte vacio barria la ventana completa: una falla momentanea de
  // la agenda borraba el espejo entero.
  it("un reporte vacio no borra la ventana", async () => {
    const admin = crearAdmin()

    const resultado = await guardarSnapshotAgenda(admin as any, {
      workspaceId: "w1",
      ...ventana,
      eventos: [],
    })

    expect(resultado.sinBarrer).toBe("reporte_vacio")
    expect(admin.llamadas.some((l) => l.op === "update:agenda_eventos")).toBe(false)
  })

  it("cuenta lo que si dio por borrado", async () => {
    const admin = crearAdmin({ alBorrar: { data: [{ id: "viejo1" }, { id: "viejo2" }], error: null } })

    const resultado = await guardarSnapshotAgenda(admin as any, {
      workspaceId: "w1",
      ...ventana,
      eventos: [evento()],
    })

    expect(resultado.marcadosEliminados).toBe(2)
  })

  it("si el barrido falla lo dice, no lo da por hecho", async () => {
    const admin = crearAdmin({ alBorrar: { data: null, error: { code: "42501" } } })

    const resultado = await guardarSnapshotAgenda(admin as any, {
      workspaceId: "w1",
      ...ventana,
      eventos: [evento()],
    })

    expect(resultado.sinBarrer).toBe("fallo_al_barrer")
    expect(resultado.ventanaBarrida).toBeNull()
  })
})

describe("resumenEspejoAgenda", () => {
  const ahora = Date.parse("2026-08-12T16:00:00Z")

  const adminCon = (filas: unknown[], ultimoReporte: string | null) =>
    crearAdmin({
      alLeer: (columnas) =>
        columnas.includes("visto_en") && !columnas.includes("fecha")
          ? { data: ultimoReporte ? [{ visto_en: ultimoReporte }] : [], error: null }
          : { data: filas, error: null },
    })

  it("con reporte fresco y sesiones en la ventana no molesta", async () => {
    const admin = adminCon(
      [{ fecha: "2026-07-31", eliminado: false }],
      "2026-08-12T04:05:57.606Z"
    )

    const espejo = await resumenEspejoAgenda(admin as any, { ...ventana, ahora })

    expect(espejo.aviso).toBeNull()
    expect(espejo.eventosVivos).toBe(1)
    expect(espejo.ultimaFechaConSesion).toBe("2026-07-31")
  })

  // Lo importante: sin este aviso, "no hay diferencias" se lee como "estoy al
  // dia" cuando en realidad la agenda dejo de hablar.
  it("avisa cuando la agenda dejo de reportar", async () => {
    const admin = adminCon([{ fecha: "2026-07-31", eliminado: false }], "2026-08-05T04:00:00.000Z")

    const espejo = await resumenEspejoAgenda(admin as any, { ...ventana, ahora })

    expect(espejo.diasSinReporte).toBe(7)
    expect(espejo.aviso).toContain("no reporta")
  })

  it("avisa cuando la agenda nunca ha reportado", async () => {
    const admin = adminCon([], null)

    const espejo = await resumenEspejoAgenda(admin as any, { ...ventana, ahora })

    expect(espejo.aviso).toContain("todavia no ha reportado")
  })

  it("avisa cuando en la ventana solo quedan eventos dados por borrados", async () => {
    const admin = adminCon(
      [{ fecha: "2026-08-12", eliminado: true }],
      "2026-08-12T04:05:57.606Z"
    )

    const espejo = await resumenEspejoAgenda(admin as any, { ...ventana, ahora })

    expect(espejo.eventosDadosPorBorrados).toBe(1)
    expect(espejo.aviso).toContain("ninguna sesion")
  })

  it("si no se puede leer el espejo, lo dice en vez de callarse", async () => {
    const admin = crearAdmin({ alLeer: () => ({ data: null, error: { code: "500" } }) })

    const espejo = await resumenEspejoAgenda(admin as any, { ...ventana, ahora })

    expect(espejo.aviso).toContain("pinzas")
  })
})
