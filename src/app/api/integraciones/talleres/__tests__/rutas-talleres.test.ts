import { beforeEach, describe, expect, it, vi } from "vitest"
import { supabaseFalso } from "@/lib/operaciones/__tests__/supabase-falso"

// Las rutas que usara la pagina de invitaciones, contra una base en memoria.

let base: any
const subidos: Array<{ ruta: string; tipo: string }> = []
const borrados: string[] = []

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))
vi.mock("@/lib/utils/periodos", () => ({ assertFechaEditable: vi.fn(async () => null) }))

const { GET: verTaller } = await import("../taller/[slug]/route")
const { POST: inscribir } = await import("../taller/[slug]/inscripciones/route")
const { GET: verBoleta } = await import("../boleta/[codigo]/route")
const { POST: subirComprobante } = await import("../boleta/[codigo]/comprobante/route")
const { tipoDeComprobante } = await import("@/lib/integraciones/talleres-publico")

const SECRETO = "secreto-de-talleres-largo"
const CODIGO = "0123456789abcdef0123456789abcdef"

const pedir = (url: string, opciones: { cuerpo?: unknown; secreto?: string | null; formulario?: FormData } = {}) => {
  const secreto = opciones.secreto === undefined ? SECRETO : opciones.secreto
  const headers: Record<string, string> = secreto ? { "x-talleres-secret": secreto } : {}
  if (opciones.cuerpo !== undefined) headers["content-type"] = "application/json"
  return new Request(url, {
    method: opciones.cuerpo !== undefined || opciones.formulario ? "POST" : "GET",
    headers,
    body: opciones.formulario ?? (opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo)),
  })
}
const conSlug = (slug: string) => ({ params: Promise.resolve({ slug }) })
const conCodigo = (codigo: string) => ({ params: Promise.resolve({ codigo }) })

function taller(extra: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    nombre: "Encuentro de la Gratitud",
    slug: "gratitud",
    tipo: "Encuentro",
    precio: 25000,
    cupo: 2,
    estado: "abierto",
    instrucciones_pago: "Nequi de la fundación",
    preguntas: [{ id: "acompanante", texto: "¿Vienes con acompañante?", tipo: "si_no", obligatoria: true }],
    ...extra,
  }
}

beforeEach(() => {
  process.env.TALLERES_SHARED_SECRET = SECRETO
  subidos.length = 0
  borrados.length = 0
  base = supabaseFalso({
    talleres: [taller(), taller({ id: "t-2", slug: "borrador", estado: "borrador" })],
    taller_inscripciones: [
      {
        id: "i-1",
        taller_id: "t-1",
        nombre: "María Ríos",
        documento: "1020304050",
        telefono: "3001234567",
        valor_acordado: 25000,
        estado: "inscrito",
        asistio: false,
        codigo_boleta: CODIGO,
        comprobante_ruta: null,
        creado_en: "2026-10-20T10:00:00Z",
      },
    ],
    ventas_externas: [{ id: "v-1", taller_inscripcion_id: "i-1", monto: 10000, metodo_pago: "nequi", fecha: "2026-10-21" }],
    asistentes: [],
  })
  base.storage = {
    from: () => ({
      upload: async (ruta: string, _bytes: Uint8Array, opciones: { contentType: string }) => {
        subidos.push({ ruta, tipo: opciones.contentType })
        return { error: null }
      },
      remove: async (rutas: string[]) => {
        borrados.push(...rutas)
        return { error: null }
      },
    }),
  }
})

describe("rutas de la invitacion de talleres", () => {
  it("sin la clave compartida no deja pasar a ninguna", async () => {
    const formulario = new FormData()
    formulario.set("archivo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "c.jpg"))
    for (const respuesta of [
      await verTaller(pedir("http://x/t", { secreto: null }), conSlug("gratitud")),
      await inscribir(pedir("http://x/t", { cuerpo: {}, secreto: "otra" }), conSlug("gratitud")),
      await verBoleta(pedir("http://x/b", { secreto: null }), conCodigo(CODIGO)),
      await subirComprobante(pedir("http://x/b", { secreto: null, formulario }), conCodigo(CODIGO)),
    ]) {
      expect(respuesta.status).toBe(401)
    }
    expect(base.escrituras).toHaveLength(0)
    expect(subidos).toHaveLength(0)
  })

  it("sin clave configurada en el servidor tampoco abre", async () => {
    delete process.env.TALLERES_SHARED_SECRET
    expect((await verTaller(pedir("http://x/t"), conSlug("gratitud"))).status).toBe(401)
  })

  it("muestra el taller con sus cupos, sin datos de los inscritos ni sus cuentas", async () => {
    const r = await verTaller(pedir("http://x/t"), conSlug("gratitud"))
    const { taller: t } = await r.json()
    expect(t).toMatchObject({ nombre: "Encuentro de la Gratitud", precio: 25000, cuposRestantes: 1, inscripcionesAbiertas: true })
    expect(JSON.stringify(t)).not.toMatch(/María|1020304050|recaudado/)
  })

  it("los borradores solo se ven en vista previa", async () => {
    expect((await verTaller(pedir("http://x/t"), conSlug("borrador"))).status).toBe(404)
    expect((await verTaller(pedir("http://x/t?vista_previa=1"), conSlug("borrador"))).status).toBe(200)
  })

  it("inscribe y devuelve solo el codigo de la boleta y como pagar", async () => {
    const r = await inscribir(
      pedir("http://x/t", {
        cuerpo: {
          nombre: "Ana Gómez",
          documento: "52.123.456",
          edad: "15",
          kit: false,
          telefono: "300 111 2233",
          correo: "ana@example.com",
          respuestas: { acompanante: "no" },
          autorizoDatos: true,
          valorAcordado: 0,
        },
      }),
      conSlug("gratitud")
    )
    expect(r.status).toBe(201)
    const cuerpo = await r.json()
    expect(cuerpo).toMatchObject({ valor: 25000, instruccionesPago: "Nequi de la fundación" })
    // (el codigo de la boleta lo pone la base; la de memoria no lo genera)
    expect(Object.keys(cuerpo).every((k) => ["codigoBoleta", "instruccionesPago", "valor"].includes(k))).toBe(true)
    expect(base.tablas.taller_inscripciones.at(-1)).toMatchObject({ origen: "invitacion", valor_acordado: 25000, edad: 15, kit: false })
    expect(base.escrituras.some((e: any) => e.tabla === "asistentes" || e.tabla === "ventas_externas")).toBe(false)
  })

  it("contesta con un mensaje claro cuando falta algo o se llenó el cupo", async () => {
    const sinAutorizar = await inscribir(
      pedir("http://x/t", { cuerpo: { nombre: "Ana", documento: "52123456", telefono: "3001112233", respuestas: { acompanante: "no" } } }),
      conSlug("gratitud")
    )
    expect(sinAutorizar.status).toBe(400)
    expect((await sinAutorizar.json()).mensaje).toMatch(/autorizar/)

    base.tablas.talleres[0].cupo = 1
    const lleno = await inscribir(
      pedir("http://x/t", {
        cuerpo: { nombre: "Ana", documento: "52123456", telefono: "3001112233", respuestas: { acompanante: "no" }, autorizoDatos: true },
      }),
      conSlug("gratitud")
    )
    expect((await lleno.json()).mensaje).toMatch(/cupos/)
  })

  it("la boleta dice como va el pago, sin cedula ni celular", async () => {
    const r = await verBoleta(pedir("http://x/b"), conCodigo(CODIGO))
    const { boleta } = await r.json()
    // (esta inscripcion es de antes del kit: queda sin dato)
    expect(boleta).toMatchObject({ nombre: "María Ríos", numero: 1, kit: null, valor: 25000, pagado: 10000, pendiente: 15000, estadoPago: "abono" })
    expect(JSON.stringify(boleta)).not.toMatch(/1020304050|3001234567/)
    expect((await verBoleta(pedir("http://x/b"), conCodigo("no-es-un-codigo"))).status).toBe(404)
  })

  it("guarda el comprobante si es una foto o un PDF de verdad, y borra el anterior", async () => {
    base.tablas.taller_inscripciones[0].comprobante_ruta = "t-1/i-1/viejo.jpg"
    const foto = new FormData()
    foto.set("archivo", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])], "pago.png"))
    const r = await subirComprobante(pedir("http://x/b", { formulario: foto }), conCodigo(CODIGO))
    expect(r.status).toBe(200)
    expect(subidos[0]).toMatchObject({ tipo: "image/png" })
    expect(subidos[0].ruta).toMatch(/^t-1\/i-1\/\d+\.png$/)
    expect(base.tablas.taller_inscripciones[0].comprobante_ruta).toBe(subidos[0].ruta)
    expect(borrados).toEqual(["t-1/i-1/viejo.jpg"])

    const disfrazado = new FormData()
    disfrazado.set("archivo", new File(["<svg onload=alert(1)>"], "pago.jpg", { type: "image/jpeg" }))
    const malo = await subirComprobante(pedir("http://x/b", { formulario: disfrazado }), conCodigo(CODIGO))
    expect(malo.status).toBe(400)
    expect((await malo.json()).mensaje).toMatch(/foto|PDF/)
  })

  it("reconoce los tipos de archivo por su contenido", () => {
    expect(tipoDeComprobante(new TextEncoder().encode("%PDF-1.7 ..."))).toMatchObject({ tipo: "application/pdf" })
    expect(tipoDeComprobante(new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic")]))).toMatchObject({ extension: "heic" })
    expect(tipoDeComprobante(new TextEncoder().encode("GIF89a"))).toBeNull()
  })
})

describe("enlace de la invitación desde el ERP", () => {
  it("un taller abierto va sin firma; un borrador lleva la firma de vista previa", async () => {
    const { enlaceInvitacion, firmaVistaPrevia } = await import("@/lib/integraciones/talleres-publico")
    expect(enlaceInvitacion("gratitud", "abierto")).toBe("https://talleres.gimnasioemocionalmb.com/gratitud/")
    const firma = firmaVistaPrevia("gratitud")
    expect(firma).toMatch(/^[0-9a-f]{32}$/)
    expect(enlaceInvitacion("gratitud", "borrador")).toBe(`https://talleres.gimnasioemocionalmb.com/gratitud/?vista=${firma}`)
    expect(firmaVistaPrevia("otro")).not.toBe(firma)
  })
})
