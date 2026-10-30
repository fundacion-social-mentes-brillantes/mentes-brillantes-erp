import { describe, expect, it } from "vitest"
import { codigoDeBoleta, documentoLegible, entradaPorCodigo, registrarLlegadaPorCodigo } from "../talleres"
import { supabaseFalso } from "./supabase-falso"

// La puerta de un taller con el QR de las boletas: de que se saca el codigo,
// que entrada es y como queda registrada la llegada.

const CODIGO = "d49613c8682b4ea1bccfab034f0aa570"
const OTRO = "0123456789abcdef0123456789abcdef"

function taller(extra: Record<string, unknown> = {}) {
  return { id: "t-1", nombre: "Cena de la Gratitud 2026", slug: "gratitud-2026", tipo: "Cena", fecha_inicio: "2026-12-18T23:00:00Z", lugar: null, ...extra }
}

function inscripcion(extra: Record<string, unknown> = {}) {
  return {
    id: "i-1",
    taller_id: "t-1",
    nombre: "María Ríos",
    documento: "1020304050",
    valor_acordado: 120000,
    estado: "inscrito",
    asistio: false,
    hora_llegada: null,
    codigo_boleta: CODIGO,
    creado_en: "2026-10-29T10:00:00Z",
    ...extra,
  }
}

function base(extra: Record<string, any[]> = {}) {
  return supabaseFalso({
    talleres: [taller(), taller({ id: "t-2", nombre: "Encuentra tu ser", slug: "encuentra-tu-ser" })],
    taller_inscripciones: [
      inscripcion({ id: "i-0", nombre: "Ana", codigo_boleta: OTRO, creado_en: "2026-10-28T09:00:00Z", asistio: true, hora_llegada: "2026-12-18T23:05:00Z" }),
      inscripcion({ id: "i-x", nombre: "Cancelada antes", codigo_boleta: "f".repeat(32), creado_en: "2026-10-28T12:00:00Z", estado: "cancelado" }),
      inscripcion(),
      inscripcion({ id: "i-9", nombre: "Luis", codigo_boleta: "a".repeat(32), creado_en: "2026-10-30T10:00:00Z" }),
    ],
    ventas_externas: [
      { id: "v-1", taller_inscripcion_id: "i-1", monto: 60000, metodo_pago: "nequi", fecha: "2026-10-29" },
      { id: "v-2", taller_inscripcion_id: "i-1", monto: 60000, metodo_pago: "nequi", fecha: "2026-10-29", estado: "anulado" },
    ],
    ...extra,
  })
}

describe("el codigo que trae el QR", () => {
  it("entiende la direccion del QR de la boleta, la del ERP, la boleta en pantalla y el codigo solo", () => {
    expect(codigoDeBoleta(`https://talleres.gimnasioemocionalmb.com/entrada/${CODIGO}`)).toBe(CODIGO)
    expect(codigoDeBoleta(`https://talleres.gimnasioemocionalmb.com/entrada/${CODIGO}/`)).toBe(CODIGO)
    expect(codigoDeBoleta(`https://mentes-brillantes-erp.vercel.app/talleres/llegada/${CODIGO}`)).toBe(CODIGO)
    expect(codigoDeBoleta(`https://talleres.gimnasioemocionalmb.com/gratitud-2026/?boleta=${CODIGO}`)).toBe(CODIGO)
    expect(codigoDeBoleta(`https://talleres.gimnasioemocionalmb.com/gratitud-2026/boleta/?c=${CODIGO}`)).toBe(CODIGO)
    expect(codigoDeBoleta(`https://talleres.gimnasioemocionalmb.com/boleta/?c=${CODIGO}`)).toBe(CODIGO)
    expect(codigoDeBoleta(`  ${CODIGO}\n`)).toBe(CODIGO)
    expect(codigoDeBoleta(CODIGO.toUpperCase())).toBe(CODIGO)
  })

  it("cualquier otro QR no es una entrada", () => {
    expect(codigoDeBoleta("https://wa.me/573001234567")).toBeNull()
    expect(codigoDeBoleta(`https://talleres.gimnasioemocionalmb.com/entrada/${CODIGO.slice(1)}`)).toBeNull()
    expect(codigoDeBoleta(`https://talleres.gimnasioemocionalmb.com/entrada/${CODIGO}0`)).toBeNull()
    expect(codigoDeBoleta(`https://talleres.gimnasioemocionalmb.com/otra/${CODIGO}`)).toBeNull()
    expect(codigoDeBoleta("hola")).toBeNull()
    expect(codigoDeBoleta("")).toBeNull()
    expect(codigoDeBoleta(null)).toBeNull()
  })
})

describe("el documento en pantalla", () => {
  it("la cedula sale con CC y la tarjeta de identidad de un menor con TI", () => {
    expect(documentoLegible("1020304050")).toBe("CC 1020304050")
    expect(documentoLegible("TI1029384756")).toBe("TI 1029384756")
    expect(documentoLegible("ti1029384756")).toBe("TI 1029384756")
    expect(documentoLegible(null)).toBe("")
    expect(documentoLegible("")).toBe("")
  })
})

describe("la entrada de una boleta", () => {
  it("trae su numero de entrada (sin contar las canceladas de antes) y lo que debe sin lo anulado", async () => {
    const entrada = await entradaPorCodigo(base(), CODIGO)
    expect(entrada).toMatchObject({
      taller: { id: "t-1", nombre: "Cena de la Gratitud 2026" },
      inscripcion: { id: "i-1", nombre: "María Ríos", asistio: false },
      numero: 2,
      cancelada: false,
      pagado: 60000,
      pendiente: 60000,
      estadoPago: "abono",
    })
  })

  it("un codigo que no es de nadie no trae nada", async () => {
    expect(await entradaPorCodigo(base(), "b".repeat(32))).toBeNull()
    expect(await entradaPorCodigo(base(), "no-es-un-codigo")).toBeNull()
  })
})

describe("registrar la llegada con el QR", () => {
  it("marca que llego con la hora y dice cuantos van, sin contar los cancelados", async () => {
    const supabase = base()
    const r = await registrarLlegadaPorCodigo(supabase, CODIGO, { tallerId: "t-1" })
    expect(r).toMatchObject({
      yaHabiaLlegado: false,
      inscripcionId: "i-1",
      nombre: "María Ríos",
      numero: 2,
      pendiente: 60000,
      tallerId: "t-1",
      llegaron: 2,
      total: 3,
    })
    expect(r.horaLlegada).toBeTruthy()
    const fila = supabase.tablas.taller_inscripciones.find((f: { id: string }) => f.id === "i-1")!
    expect(fila).toMatchObject({ asistio: true, hora_llegada: r.horaLlegada })
  })

  it("la misma boleta otra vez no cambia nada y dice a que hora entro", async () => {
    const supabase = base()
    const r = await registrarLlegadaPorCodigo(supabase, OTRO, { tallerId: "t-1" })
    expect(r).toMatchObject({ yaHabiaLlegado: true, nombre: "Ana", horaLlegada: "2026-12-18T23:05:00Z", llegaron: 1, total: 3 })
    expect(supabase.escrituras).toHaveLength(0)
  })

  it("en la puerta de un taller no vale la boleta de otro", async () => {
    const supabase = base()
    await expect(registrarLlegadaPorCodigo(supabase, CODIGO, { tallerId: "t-2" })).rejects.toThrow(/otro taller: Cena de la Gratitud 2026/)
    expect(supabase.escrituras).toHaveLength(0)
  })

  it("no deja entrar con una inscripcion cancelada ni con un codigo que no existe", async () => {
    const supabase = base()
    await expect(registrarLlegadaPorCodigo(supabase, "f".repeat(32))).rejects.toThrow(/cancelada/)
    await expect(registrarLlegadaPorCodigo(supabase, "b".repeat(32))).rejects.toThrow(/no existe/)
    expect(supabase.escrituras).toHaveLength(0)
  })

  it("sin taller (la pagina que abre la camara del celular) vale la boleta de cualquier taller", async () => {
    const supabase = base()
    await expect(registrarLlegadaPorCodigo(supabase, "a".repeat(32))).resolves.toMatchObject({ yaHabiaLlegado: false, nombre: "Luis", numero: 3 })
  })
})
