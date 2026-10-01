import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/utils/fechas", () => ({ fechaHoyBogota: () => "2026-10-01" }))

import { crearPersona, editarPersona, previsualizarEdicionPersona, siguienteCodigoPersona } from "../personas"
import { supabaseFalso } from "./supabase-falso"

const ADMIN = { userId: "u-admin", role: "admin" as const }
const CAJA = { userId: "u-caja", role: "caja" as const }

function conPersona() {
  return supabaseFalso({
    asistentes: [
      {
        id: "p-1",
        nombre: "Carmen Liliana Moreno",
        codigo: "259",
        cedula: "52727846",
        correo: "liliana@ejemplo.com",
        telefono: "3212257085",
        fecha_registro: "2026-09-10",
        fecha_inicio_proceso: "2026-09-10",
        activo: true,
      },
      { id: "p-2", nombre: "Otra", codigo: "12" },
    ],
  })
}

const updatesDe = (sb: any) => sb.escrituras.filter((e: any) => e.tipo === "update")

describe("editar una persona por el MCP", () => {
  it("solo escribe lo que cambia: no borra el codigo ni las fechas que no se mandaron", async () => {
    const sb = conPersona()

    await editarPersona(sb, ADMIN, "p-1", { telefono: "3000000000" })

    expect(updatesDe(sb)).toEqual([
      { tipo: "update", tabla: "asistentes", cambios: { telefono: "3000000000" }, filtros: [["id", "p-1"]] },
    ])
    const persona = sb.tablas.asistentes[0]
    expect(persona.codigo).toBe("259")
    expect(persona.fecha_registro).toBe("2026-09-10")
    expect(persona.fecha_inicio_proceso).toBe("2026-09-10")
  })

  it("un campo vacio se borra a proposito, y un campo omitido no se toca", async () => {
    const sb = conPersona()
    await editarPersona(sb, ADMIN, "p-1", { correo: "" })
    expect(updatesDe(sb)[0].cambios).toEqual({ correo: null })
    expect(sb.tablas.asistentes[0].cedula).toBe("52727846")
  })

  it("la cajera no puede cambiar fechas, igual que en la web", async () => {
    const sb = conPersona()
    await expect(editarPersona(sb, CAJA, "p-1", { fechaRegistro: "2026-01-01" })).rejects.toThrow(/administrador/)
    expect(updatesDe(sb)).toEqual([])
  })

  it("avisa en vez de guardar en vacio cuando nada cambia", async () => {
    const sb = conPersona()
    await expect(previsualizarEdicionPersona(sb, ADMIN, "p-1", { codigo: "259" })).rejects.toThrow(/nada que cambiar/)
  })

  it("no deja el nombre vacio", async () => {
    const sb = conPersona()
    await expect(editarPersona(sb, ADMIN, "p-1", { nombre: "  " })).rejects.toThrow(/nombre/)
  })
})

describe("crear una persona por el MCP", () => {
  it("le asigna el siguiente codigo libre y la fecha de registro de hoy", async () => {
    const sb = conPersona()
    const r = await crearPersona(sb, CAJA, { nombre: "Persona Nueva" })

    expect(r.codigo).toBe("260")
    const insertada = sb.escrituras.find((e: any) => e.tipo === "insert").fila
    expect(insertada).toMatchObject({ nombre: "Persona Nueva", codigo: "260", fecha_registro: "2026-10-01" })
  })

  it("respeta el codigo que se indique", async () => {
    const sb = conPersona()
    const r = await crearPersona(sb, ADMIN, { nombre: "Persona Nueva", codigo: "300" })
    expect(r.codigo).toBe("300")
  })

  it("solo admin fija fechas a mano", async () => {
    const sb = conPersona()
    await expect(crearPersona(sb, CAJA, { nombre: "Persona Nueva", fechaRegistro: "2026-01-01" })).rejects.toThrow(
      /administrador/
    )
  })

  it("el siguiente codigo ignora los codigos no numericos", async () => {
    const sb = supabaseFalso({ asistentes: [{ codigo: "7" }, { codigo: "ABC" }, { codigo: null }, { codigo: "41" }] })
    expect(await siguienteCodigoPersona(sb)).toBe("42")
  })
})
