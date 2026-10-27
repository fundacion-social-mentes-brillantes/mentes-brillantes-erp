import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/utils/periodos", () => ({ assertFechaEditable: vi.fn(async () => null) }))

import { assertFechaEditable } from "@/lib/utils/periodos"
import {
  cancelarInscripcion,
  crearTaller,
  editarInscripcion,
  inscribirEnTaller,
  listarTalleres,
  normalizarDocumento,
  normalizarFechaTaller,
  normalizarTelefono,
  registrarGastoTaller,
  registrarPagoTaller,
  resumirTaller,
  slugDesdeNombre,
  talleresDePersona,
  validarPreguntas,
  validarRespuestas,
} from "../talleres"
import { supabaseFalso } from "./supabase-falso"

const ADMIN = { userId: "11111111-2222-3333-4444-555555555555", role: "admin" as const }
const INVITACION = { userId: "invitacion" }

function taller(extra: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    nombre: "Encuentro de la Gratitud",
    slug: "encuentro-de-la-gratitud",
    precio: 25000,
    cupo: null,
    estado: "abierto",
    preguntas: [
      { id: "acompanante", texto: "¿Vienes con acompañante?", tipo: "si_no", obligatoria: true },
      { id: "talla", texto: "Talla de camiseta", tipo: "opciones", opciones: ["S", "M", "L"], obligatoria: false },
    ],
    ...extra,
  }
}

function inscripcion(extra: Record<string, unknown> = {}) {
  return {
    id: "i-1",
    taller_id: "t-1",
    nombre: "María Ríos",
    documento: "1020304050",
    telefono: "3001234567",
    valor_acordado: 25000,
    estado: "inscrito",
    asistio: false,
    hora_llegada: null,
    asistente_id: null,
    creado_en: "2026-10-20T10:00:00Z",
    ...extra,
  }
}

beforeEach(() => {
  vi.mocked(assertFechaEditable).mockResolvedValue(null)
})

describe("datos de la persona", () => {
  it("la cedula se guarda sin puntos ni espacios", () => {
    expect(normalizarDocumento("1.020.304.050")).toBe("1020304050")
    expect(normalizarDocumento(" 52 123 456 ")).toBe("52123456")
    expect(normalizarDocumento("")).toBeNull()
    expect(() => normalizarDocumento("12")).toThrow(/cédula/)
  })

  it("el celular con +57 y sin el es el mismo", () => {
    expect(normalizarTelefono("+57 300 123 4567")).toBe("3001234567")
    expect(normalizarTelefono("300-123-4567")).toBe("3001234567")
    expect(() => normalizarTelefono("123")).toThrow(/celular/)
  })

  it("arma el enlace del taller sin tildes ni signos", () => {
    expect(slugDesdeNombre("Encuentro de la Gratitud ¡2026!")).toBe("encuentro-de-la-gratitud-2026")
    expect(slugDesdeNombre("Niñez y Emoción")).toBe("ninez-y-emocion")
  })

  it("la hora del taller queda en hora de Colombia", () => {
    expect(normalizarFechaTaller("2026-11-22T09:00")).toBe("2026-11-22T09:00:00-05:00")
    expect(normalizarFechaTaller("")).toBeNull()
    expect(() => normalizarFechaTaller("mañana")).toThrow(/fecha/)
  })
})

describe("preguntas propias del formulario", () => {
  it("rechaza preguntas vacias y listas con menos de dos opciones", () => {
    expect(() => validarPreguntas([{ texto: " ", tipo: "texto" }])).toThrow(/vacía/)
    expect(() => validarPreguntas([{ texto: "¿Talla?", tipo: "opciones", opciones: ["M"] }])).toThrow(/2 opciones/)
    expect(() => validarPreguntas([{ texto: "¿Algo?", tipo: "dibujo" }])).toThrow(/tipo/)
  })

  it("no deja dos preguntas con el mismo id y limpia opciones repetidas", () => {
    const preguntas = validarPreguntas([
      { id: "a", texto: "Uno", tipo: "texto" },
      { id: "a", texto: "Dos", tipo: "opciones", opciones: ["Sí", "Sí", "No", ""] },
    ])
    expect(new Set(preguntas.map((p) => p.id)).size).toBe(2)
    expect(preguntas[1].opciones).toEqual(["Sí", "No"])
  })

  it("las obligatorias solo se exigen cuando se pide", () => {
    const preguntas = validarPreguntas(taller().preguntas)
    expect(() => validarRespuestas(preguntas, {}, { exigirObligatorias: true })).toThrow(/acompañante/)
    expect(validarRespuestas(preguntas, {})).toEqual({})
  })

  it("rechaza respuestas fuera de las opciones y descarta preguntas que no existen", () => {
    const preguntas = validarPreguntas(taller().preguntas)
    expect(() => validarRespuestas(preguntas, { talla: "XXL" })).toThrow(/opciones/)
    expect(validarRespuestas(preguntas, { acompanante: "si", otra: "x" })).toEqual({ acompanante: "si" })
  })
})

describe("cuentas de un taller", () => {
  it("los pagos anulados no cuentan y una inscripcion cancelada no debe nada", () => {
    const r = resumirTaller({
      inscripciones: [
        inscripcion(),
        inscripcion({ id: "i-2", asistio: true }),
        inscripcion({ id: "i-3", estado: "cancelado" }),
        inscripcion({ id: "i-4", valor_acordado: 0 }),
      ],
      pagos: [
        { id: "v-1", taller_inscripcion_id: "i-1", monto: 10000, metodo_pago: "nequi", fecha: "2026-10-21" },
        { id: "v-2", taller_inscripcion_id: "i-2", monto: 25000, metodo_pago: "efectivo", fecha: "2026-10-21" },
        { id: "v-3", taller_inscripcion_id: "i-1", monto: 15000, metodo_pago: "nequi", fecha: "2026-10-22", estado: "anulado" },
      ],
      gastos: [
        { id: "e-1", concepto: "Refrigerios", monto: 8000, fecha: "2026-10-22" },
        { id: "e-2", concepto: "Anulado", monto: 99000, fecha: "2026-10-22", notas: "[ANULADO] x" },
      ],
    })
    expect(r.inscritos).toBe(3)
    expect(r.cancelados).toBe(1)
    expect(r.asistieron).toBe(1)
    expect(r.recaudado).toBe(35000)
    expect(r.porCobrar).toBe(15000)
    expect(r.gastos).toBe(8000)
    expect(r.resultado).toBe(27000)
    expect(r.pagaronTodo).toBe(2)
    expect(r.conDeuda).toBe(1)
    const fila = r.filas.find((f) => f.id === "i-1")!
    expect(fila).toMatchObject({ pagado: 10000, pendiente: 15000, estadoPago: "abono" })
    expect(r.filas.find((f) => f.id === "i-4")!.estadoPago).toBe("sin_costo")
  })

  it("lista cada taller con sus propias cifras", async () => {
    const supabase = supabaseFalso({
      talleres: [taller(), taller({ id: "t-2", nombre: "Otro", slug: "otro" })],
      taller_inscripciones: [inscripcion(), inscripcion({ id: "i-9", taller_id: "t-2", valor_acordado: 50000 })],
      ventas_externas: [
        { id: "v-1", taller_inscripcion_id: "i-1", monto: 25000, metodo_pago: "nequi", fecha: "2026-10-21" },
        { id: "v-x", taller_inscripcion_id: null, monto: 70000, metodo_pago: "nequi", fecha: "2026-10-21" },
      ],
      egresos: [
        { id: "e-1", concepto: "Salón", monto: 30000, fecha: "2026-10-22", taller_id: "t-2" },
        { id: "e-x", concepto: "Arriendo", monto: 900000, fecha: "2026-10-22", taller_id: null },
      ],
    })
    const lista = await listarTalleres(supabase)
    const uno = lista.find((t) => t.taller.id === "t-1")!.resumen
    const dos = lista.find((t) => t.taller.id === "t-2")!.resumen
    expect(uno).toMatchObject({ recaudado: 25000, porCobrar: 0, gastos: 0 })
    expect(dos).toMatchObject({ recaudado: 0, porCobrar: 50000, gastos: 30000, resultado: -30000 })
  })
})

describe("crear un taller", () => {
  it("no deja dos talleres con el mismo enlace", async () => {
    const supabase = supabaseFalso({ talleres: [taller()] })
    await expect(crearTaller(supabase, ADMIN, { nombre: "Encuentro de la Gratitud", precio: 0 })).rejects.toThrow(
      /enlace/
    )
  })

  it("guarda el taller y deja rastro en la auditoria", async () => {
    const supabase = supabaseFalso({ talleres: [] })
    const r = await crearTaller(supabase, ADMIN, {
      nombre: "Taller de duelo",
      precio: "40000",
      cupo: "",
      estado: "abierto",
      fechaInicio: "2026-11-30T15:00",
    })
    expect(r.slug).toBe("taller-de-duelo")
    const fila = supabase.tablas.talleres[0]
    expect(fila).toMatchObject({ precio: 40000, cupo: null, estado: "abierto", fecha_inicio: "2026-11-30T15:00:00-05:00" })
    expect(supabase.tablas.auditoria_financiera[0]).toMatchObject({ accion: "crear_taller", valor_nuevo: 40000 })
  })
})

describe("inscribir", () => {
  it("desde la invitacion exige taller abierto, autorizacion de datos, cedula y celular", async () => {
    const base = {
      tallerId: "t-1",
      nombre: "Ana",
      documento: "52123456",
      telefono: "3001112233",
      respuestas: { acompanante: "no" },
      origen: "invitacion" as const,
    }
    const cerrado = supabaseFalso({ talleres: [taller({ estado: "cerrado" })] })
    await expect(inscribirEnTaller(cerrado, INVITACION, { ...base, autorizoDatos: true })).rejects.toThrow(/cerradas/)

    const abierto = supabaseFalso({ talleres: [taller()] })
    await expect(inscribirEnTaller(abierto, INVITACION, base)).rejects.toThrow(/autorizar/)
    await expect(
      inscribirEnTaller(abierto, INVITACION, { ...base, telefono: "", autorizoDatos: true })
    ).rejects.toThrow(/celular/)
    await expect(
      inscribirEnTaller(abierto, INVITACION, { ...base, respuestas: {}, autorizoDatos: true })
    ).rejects.toThrow(/acompañante/)
  })

  it("desde la invitacion siempre cobra el valor del taller, y no deja rastro de auditoria sin usuario", async () => {
    const supabase = supabaseFalso({ talleres: [taller()], taller_inscripciones: [] })
    const r = await inscribirEnTaller(supabase, INVITACION, {
      tallerId: "t-1",
      nombre: "Ana",
      documento: "52.123.456",
      telefono: "+57 300 111 2233",
      respuestas: { acompanante: "si" },
      valorAcordado: 0,
      origen: "invitacion",
      autorizoDatos: true,
    })
    expect(r.valorAcordado).toBe(25000)
    expect(supabase.tablas.taller_inscripciones[0]).toMatchObject({
      documento: "52123456",
      telefono: "3001112233",
      origen: "invitacion",
      respuestas: { acompanante: "si" },
    })
    expect(supabase.tablas.taller_inscripciones[0].autorizo_datos_en).toBeTruthy()
    expect(supabase.tablas.auditoria_financiera ?? []).toHaveLength(0)
  })

  it("no inscribe dos veces la misma cedula, salvo que la anterior se haya cancelado", async () => {
    const supabase = supabaseFalso({ talleres: [taller()], taller_inscripciones: [inscripcion()] })
    await expect(
      inscribirEnTaller(supabase, ADMIN, { tallerId: "t-1", nombre: "Otra", documento: "1.020.304.050" })
    ).rejects.toThrow(/ya está inscrita/)

    const conCancelada = supabaseFalso({
      talleres: [taller()],
      taller_inscripciones: [inscripcion({ estado: "cancelado" })],
    })
    await expect(
      inscribirEnTaller(conCancelada, ADMIN, { tallerId: "t-1", nombre: "Otra", documento: "1020304050" })
    ).resolves.toMatchObject({ valorAcordado: 25000 })
  })

  it("respeta el cupo en la invitacion, pero el equipo puede inscribir de mas", async () => {
    const datos = {
      tallerId: "t-1",
      nombre: "Ana",
      documento: "52123456",
      telefono: "3001112233",
      respuestas: { acompanante: "no" },
      autorizoDatos: true,
    }
    const supabase = supabaseFalso({ talleres: [taller({ cupo: 1 })], taller_inscripciones: [inscripcion()] })
    await expect(inscribirEnTaller(supabase, INVITACION, { ...datos, origen: "invitacion" })).rejects.toThrow(/cupos/)
    await expect(inscribirEnTaller(supabase, ADMIN, { ...datos, origen: "puerta", asistio: true })).resolves.toBeTruthy()
    const nueva = supabase.tablas.taller_inscripciones.at(-1)
    expect(nueva).toMatchObject({ origen: "puerta", asistio: true })
    expect(nueva.hora_llegada).toBeTruthy()
  })

  it("el equipo puede dejar un valor distinto (descuento o cortesia) y queda en la auditoria", async () => {
    const supabase = supabaseFalso({ talleres: [taller()], taller_inscripciones: [] })
    await inscribirEnTaller(supabase, ADMIN, { tallerId: "t-1", nombre: "Beca", valorAcordado: "0" })
    expect(supabase.tablas.taller_inscripciones[0].valor_acordado).toBe(0)
    expect(supabase.tablas.auditoria_financiera[0]).toMatchObject({ accion: "crear_inscripcion_taller", valor_nuevo: 0 })
  })

  it("si ya es asistente del ERP la enlaza a su ficha, sin crear nada en asistentes", async () => {
    const supabase = supabaseFalso({
      talleres: [taller()],
      taller_inscripciones: [],
      asistentes: [
        { id: "a-1", nombre: "María", cedula: "1020304050", telefono: null },
        { id: "a-2", nombre: "Pedro", cedula: null, telefono: "+57 310 555 6677" },
      ],
    })
    await inscribirEnTaller(supabase, ADMIN, { tallerId: "t-1", nombre: "María", documento: "1.020.304.050" })
    await inscribirEnTaller(supabase, ADMIN, { tallerId: "t-1", nombre: "Pedro", telefono: "3105556677" })
    await inscribirEnTaller(supabase, ADMIN, { tallerId: "t-1", nombre: "Nueva", documento: "99887766" })
    expect(supabase.tablas.taller_inscripciones.map((i: any) => i.asistente_id)).toEqual(["a-1", "a-2", null])
    expect(supabase.escrituras.filter((e: any) => e.tabla === "asistentes")).toHaveLength(0)
  })
})

describe("pagos del taller", () => {
  it("entra como venta externa marcada con la inscripcion", async () => {
    const supabase = supabaseFalso({ talleres: [taller()], taller_inscripciones: [inscripcion()], ventas_externas: [] })
    const r = await registrarPagoTaller(supabase, ADMIN, {
      inscripcionId: "i-1",
      monto: 10000,
      metodoPago: "nequi",
      fecha: "2026-10-27",
    })
    expect(r).toMatchObject({ pagadoDespues: 10000, pendienteDespues: 15000 })
    expect(supabase.tablas.ventas_externas[0]).toMatchObject({
      concepto: "Encuentro de la Gratitud · Inscripción",
      comprador_nombre: "María Ríos",
      monto: 10000,
      metodo_pago: "nequi",
      taller_inscripcion_id: "i-1",
    })
  })

  it("no acepta mas de lo que falta, y lo anulado no cuenta como pagado", async () => {
    const supabase = supabaseFalso({
      talleres: [taller()],
      taller_inscripciones: [inscripcion()],
      ventas_externas: [
        { id: "v-1", taller_inscripcion_id: "i-1", monto: 20000, metodo_pago: "nequi", fecha: "2026-10-21" },
        { id: "v-2", taller_inscripcion_id: "i-1", monto: 5000, metodo_pago: "nequi", fecha: "2026-10-21", estado: "anulado" },
      ],
    })
    await expect(
      registrarPagoTaller(supabase, ADMIN, { inscripcionId: "i-1", monto: 6000, metodoPago: "nequi", fecha: "2026-10-27" })
    ).rejects.toThrow(/supera lo que falta/)
    await expect(
      registrarPagoTaller(supabase, ADMIN, { inscripcionId: "i-1", monto: 5000, metodoPago: "efectivo", fecha: "2026-10-27" })
    ).resolves.toMatchObject({ pendienteDespues: 0 })
  })

  it("respeta el periodo cerrado", async () => {
    vi.mocked(assertFechaEditable).mockResolvedValue("Periodo cerrado")
    const supabase = supabaseFalso({ talleres: [taller()], taller_inscripciones: [inscripcion()], ventas_externas: [] })
    await expect(
      registrarPagoTaller(supabase, ADMIN, { inscripcionId: "i-1", monto: 5000, metodoPago: "nequi", fecha: "2026-08-01" })
    ).rejects.toThrow(/Periodo cerrado/)
    expect(supabase.tablas.ventas_externas).toHaveLength(0)
  })

  it("no cobra a una inscripcion cancelada", async () => {
    const supabase = supabaseFalso({ talleres: [taller()], taller_inscripciones: [inscripcion({ estado: "cancelado" })] })
    await expect(
      registrarPagoTaller(supabase, ADMIN, { inscripcionId: "i-1", monto: 5000, metodoPago: "nequi", fecha: "2026-10-27" })
    ).rejects.toThrow(/cancelada/)
  })
})

describe("cambios a una inscripcion", () => {
  it("no se cancela si ya pago algo", async () => {
    const supabase = supabaseFalso({
      taller_inscripciones: [inscripcion()],
      ventas_externas: [{ id: "v-1", taller_inscripcion_id: "i-1", monto: 5000, metodo_pago: "nequi", fecha: "2026-10-21" }],
    })
    await expect(cancelarInscripcion(supabase, ADMIN, "i-1")).rejects.toThrow(/anula primero/)
  })

  it("el valor a pagar no baja de lo ya pagado, y el cambio queda en la auditoria", async () => {
    const supabase = supabaseFalso({
      taller_inscripciones: [inscripcion()],
      ventas_externas: [{ id: "v-1", taller_inscripcion_id: "i-1", monto: 20000, metodo_pago: "nequi", fecha: "2026-10-21" }],
    })
    await expect(editarInscripcion(supabase, ADMIN, "i-1", { valorAcordado: 15000 })).rejects.toThrow(/no puede quedar por debajo/)
    await editarInscripcion(supabase, ADMIN, "i-1", { valorAcordado: 20000 })
    expect(supabase.tablas.taller_inscripciones[0].valor_acordado).toBe(20000)
    expect(supabase.tablas.auditoria_financiera[0]).toMatchObject({
      accion: "editar_valor_inscripcion_taller",
      valor_anterior: 25000,
      valor_nuevo: 20000,
    })
  })
})

describe("gastos del taller", () => {
  it("entra como egreso marcado con el taller", async () => {
    const supabase = supabaseFalso({ talleres: [taller()], egresos: [] })
    await registrarGastoTaller(supabase, ADMIN, {
      tallerId: "t-1",
      concepto: "Pago tallerista invitada",
      monto: 150000,
      categoria: "Honorarios",
      metodoPago: "nequi",
      fecha: "2026-10-27",
    })
    expect(supabase.tablas.egresos[0]).toMatchObject({
      concepto: "Encuentro de la Gratitud · Pago tallerista invitada",
      monto: 150000,
      categoria: "Honorarios",
      taller_id: "t-1",
    })
  })
})

describe("talleres en la ficha de una persona", () => {
  it("trae los enlazados a ella y los de su cedula, sin los de otra persona ni los cancelados", async () => {
    const supabase = supabaseFalso({
      talleres: [
        taller({ fecha_inicio: "2026-11-22T09:00:00-05:00" }),
        taller({ id: "t-2", nombre: "Duelo", fecha_inicio: "2026-09-01T09:00:00-05:00" }),
      ],
      taller_inscripciones: [
        inscripcion({ asistente_id: "a-1" }),
        inscripcion({ id: "i-2", taller_id: "t-2", asistente_id: null }),
        inscripcion({ id: "i-3", taller_id: "t-2", asistente_id: "a-otra" }),
        inscripcion({ id: "i-4", taller_id: "t-2", asistente_id: "a-1", estado: "cancelado" }),
      ],
      ventas_externas: [{ id: "v-1", taller_inscripcion_id: "i-1", monto: 25000, metodo_pago: "nequi", fecha: "2026-10-21" }],
    })
    const lista = await talleresDePersona(supabase, { id: "a-1", cedula: "1020304050" })
    expect(lista.map((f) => f.id)).toEqual(["i-1", "i-2"])
    expect(lista[0]).toMatchObject({ pagado: 25000, estadoPago: "al_dia", taller: { nombre: "Encuentro de la Gratitud" } })
    expect(lista[1]).toMatchObject({ pagado: 0, pendiente: 25000, estadoPago: "debe" })
  })
})
