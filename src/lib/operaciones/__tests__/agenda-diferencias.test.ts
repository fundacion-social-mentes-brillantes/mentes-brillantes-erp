import { describe, expect, it } from "vitest"
import { calcularDiferencias } from "../agenda-sync"
import { supabaseFalso } from "./supabase-falso"

// Lo que cambios_agenda reporta al comparar la agenda con el ERP. Las fechas van
// en diciembre (todavia no pasan) para no tocar el cupo de las sesiones sin registrar.

const VENTANA = { desde: "2026-12-01", hasta: "2026-12-31" }

function evento(extra: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    codigo_persona: 36,
    nombre_persona: "Edna Yeimmy Baquero Ruiz",
    fecha: "2026-12-04",
    titulo: "Sesión coach",
    hecho: false,
    eliminado: false,
    ...extra,
  }
}

function base(tablas: Record<string, any[]>) {
  return supabaseFalso({
    agenda_eventos: [],
    agenda_diferencias_resueltas: [],
    asistentes: [{ id: "a-36", codigo: "36", nombre: "Edna Yeimmy Baquero Ruiz" }],
    coach_sesiones: [],
    ...tablas,
  })
}

describe("diferencias entre la agenda y el ERP", () => {
  it("una persona repetida en la agenda (otro código) no es persona nueva si su sesión ya está enlazada a su ficha", async () => {
    const supabase = base({
      agenda_eventos: [evento({ id: "Nn2AP9wgTGkYhJBtE8I5", codigo_persona: 262 })],
      coach_sesiones: [{ id: "s-1", asistente_id: "a-36", fecha: "2026-12-04", evento_agenda_id: "Nn2AP9wgTGkYhJBtE8I5" }],
    })
    expect(await calcularDiferencias(supabase, VENTANA)).toEqual([])
  })

  it("si el código de la agenda ya es de otra persona, manda la persona de la sesión enlazada", async () => {
    const supabase = base({
      asistentes: [
        { id: "a-36", codigo: "36", nombre: "Edna Yeimmy Baquero Ruiz" },
        { id: "a-262", codigo: "262", nombre: "María Angélica" },
      ],
      agenda_eventos: [evento({ id: "Nn2AP9wgTGkYhJBtE8I5", codigo_persona: 262, fecha: "2026-12-10" })],
      coach_sesiones: [{ id: "s-1", asistente_id: "a-36", fecha: "2026-12-04", evento_agenda_id: "Nn2AP9wgTGkYhJBtE8I5" }],
    })
    const [d] = await calcularDiferencias(supabase, VENTANA)
    expect(d).toMatchObject({ tipo: "fecha_movida", nombrePersona: "Edna Yeimmy Baquero Ruiz" })
  })

  it("con muchos eventos lee las sesiones enlazadas por tandas", async () => {
    const eventos = Array.from({ length: 250 }, (_, i) => evento({ id: `ev-${i}`, fecha: "2026-12-10" }))
    const supabase = base({
      agenda_eventos: eventos,
      coach_sesiones: [{ id: "s-7", asistente_id: "a-36", fecha: "2026-11-02", evento_agenda_id: "ev-230" }],
    })
    const diferencias = await calcularDiferencias(supabase, VENTANA)
    expect(diferencias).toHaveLength(1)
    expect(diferencias[0]).toMatchObject({ tipo: "fecha_movida", eventoId: "ev-230" })
  })

  it("si la sesión enlazada está en otra fecha, avisa que se movió a nombre de la ficha de verdad", async () => {
    const supabase = base({
      agenda_eventos: [evento({ id: "ev-9", codigo_persona: 262, fecha: "2026-12-10" })],
      coach_sesiones: [{ id: "s-1", asistente_id: "a-36", fecha: "2026-12-04", evento_agenda_id: "ev-9" }],
    })
    const [d] = await calcularDiferencias(supabase, VENTANA)
    expect(d).toMatchObject({ tipo: "fecha_movida", eventoId: "ev-9", nombrePersona: "Edna Yeimmy Baquero Ruiz" })
  })

  it("ve la sesión enlazada aunque su fecha quede por fuera de la ventana", async () => {
    const supabase = base({
      agenda_eventos: [evento({ id: "ev-2", fecha: "2026-12-10" })],
      coach_sesiones: [{ id: "s-2", asistente_id: "a-36", fecha: "2026-11-20", evento_agenda_id: "ev-2" }],
    })
    const [d] = await calcularDiferencias(supabase, VENTANA)
    expect(d).toMatchObject({ tipo: "fecha_movida", detalle: { sesionErpId: "s-2", fechaErp: "2026-11-20" } })
  })

  it("alguien que de verdad no está en el ERP sigue saliendo como persona nueva", async () => {
    const supabase = base({ agenda_eventos: [evento({ id: "ev-3", codigo_persona: 999, nombre_persona: "Persona Nueva" })] })
    const [d] = await calcularDiferencias(supabase, VENTANA)
    expect(d).toMatchObject({ tipo: "persona_nueva", eventoId: "ev-3", codigoPersona: 999 })
  })

  it("un evento borrado con un código que el ERP no tiene no avisa nada", async () => {
    const supabase = base({ agenda_eventos: [evento({ id: "ev-4", codigo_persona: 999, eliminado: true })] })
    expect(await calcularDiferencias(supabase, VENTANA)).toEqual([])
  })

  it("una diferencia marcada como revisada no vuelve a salir", async () => {
    const supabase = base({
      agenda_eventos: [evento({ id: "ev-5", codigo_persona: 999 })],
      agenda_diferencias_resueltas: [{ evento_id: "ev-5", tipo: "persona_nueva" }],
    })
    expect(await calcularDiferencias(supabase, VENTANA)).toEqual([])
  })
})
