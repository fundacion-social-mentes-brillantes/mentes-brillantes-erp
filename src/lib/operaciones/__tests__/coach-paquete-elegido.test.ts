import { describe, expect, it } from "vitest"
import { registrarSesionCoach } from "../coach"
import { supabaseFalso } from "./supabase-falso"

const ACTOR = { userId: "u-1", role: "admin" as const }

function personaConDosPaquetes() {
  return supabaseFalso(
    {
      coach_paquetes: [
        { id: "viejo", asistente_id: "p-1", sesiones_compradas: 24, creado_en: "2026-05-16T00:00:00Z", cuenta_id: "c-viejo" },
        { id: "nuevo", asistente_id: "p-1", sesiones_compradas: 1, creado_en: "2026-09-25T00:00:00Z", cuenta_id: "c-nuevo" },
      ],
      coach_sesiones: [],
      asistentes: [{ id: "p-1", fecha_inicio_proceso: "2026-03-05" }],
    },
    {
      embebidos: {
        coach_paquetes: (fila, tablas) => ({
          ...fila,
          coach_sesiones: tablas.coach_sesiones.filter((s) => s.paquete_id === fila.id),
          cuentas_por_cobrar: { concepto: fila.id, fecha_emision: fila.creado_en.slice(0, 10) },
        }),
      },
    }
  )
}

describe("sesion coach en un paquete concreto", () => {
  it("sin indicar paquete sigue gastando el credito mas antiguo (lo de siempre)", async () => {
    const sb = personaConDosPaquetes()
    const r = await registrarSesionCoach(sb, ACTOR, { asistenteId: "p-1", fecha: "2026-09-25" })
    expect(r.paqueteId).toBe("viejo")
  })

  it("indicando el paquete, la sesion cae en ese aunque haya uno mas viejo con cupo", async () => {
    const sb = personaConDosPaquetes()
    const r = await registrarSesionCoach(sb, ACTOR, { asistenteId: "p-1", fecha: "2026-09-25", paqueteId: "nuevo" })
    expect(r.paqueteId).toBe("nuevo")
    expect(sb.tablas.coach_sesiones[0]).toMatchObject({ paquete_id: "nuevo", fecha: "2026-09-25" })
  })

  it("rechaza un paquete ajeno o agotado", async () => {
    const sb = personaConDosPaquetes()
    await registrarSesionCoach(sb, ACTOR, { asistenteId: "p-1", fecha: "2026-09-25", paqueteId: "nuevo" })
    await expect(
      registrarSesionCoach(sb, ACTOR, { asistenteId: "p-1", fecha: "2026-09-26", paqueteId: "nuevo" })
    ).rejects.toThrow(/ya no le quedan/)
    await expect(
      registrarSesionCoach(sb, ACTOR, { asistenteId: "p-1", fecha: "2026-09-26", paqueteId: "de-otra" })
    ).rejects.toThrow(/no es de la persona/)
  })
})
