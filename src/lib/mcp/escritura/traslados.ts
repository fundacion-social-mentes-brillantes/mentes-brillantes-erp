import { z } from "zod"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import { cargarMediosPago, nombreMedio, resolverClaveMedio } from "@/lib/medios-pago"
import { cambiarMedioPagoActivo, crearMedioPago, renombrarMedioPago } from "@/lib/operaciones/medios-pago"
import { anularTraslado, registrarTraslado, validarAnulacionTraslado, validarTraslado } from "@/lib/operaciones/traslados"
import { OperacionMcpError } from "../operaciones"
import { FECHA, METODO_PAGO, money, operacion, type DefinicionOperacion } from "./comun"

// Traslados entre las cuentas de la fundacion (Nequi -> Banco Caja Social,
// efectivo consignado en el banco...) y la lista de cuentas de dinero. Las
// reglas viven en lib/operaciones/traslados.ts y medios-pago.ts; en la web
// ambas cosas son solo del admin.

const ACCIONES_CUENTA = ["crear", "renombrar", "ocultar", "mostrar"] as const
type CambioCuenta = { accion: (typeof ACCIONES_CUENTA)[number]; clave: string; nombre: string }

export const OPERACIONES_TRASLADOS: DefinicionOperacion[] = [
  operacion({
    nombre: "traslado",
    titulo: "Pasar plata de una cuenta a otra",
    descripcion:
      "Registra que la fundacion movio plata entre sus propias cuentas (p. ej. de Nequi al Banco Caja Social, o el " +
      "efectivo consignado en el banco). NO es ingreso ni gasto: no cambia la utilidad ni lo de los socios, solo lo que " +
      "hay en cada cuenta en el Resumen por cuenta de la liquidacion.",
    roles: ["admin"],
    riesgo: "crear",
    schema: {
      monto: z.coerce.number().positive().max(100_000_000),
      sale_de: METODO_PAGO.describe("Cuenta de donde sale la plata (clave o nombre, p. ej. nequi)"),
      llega_a: METODO_PAGO.describe("Cuenta a donde llega (clave o nombre, p. ej. \"Banco Caja Social\")"),
      fecha: FECHA.optional().describe("Dia del traslado; por defecto hoy"),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const t = await validarTraslado(admin, {
        monto: Number(args.monto),
        origen: String(args.sale_de),
        destino: String(args.llega_a),
        fecha: String(args.fecha || fechaHoyBogota()),
        notas: args.notas ?? null,
      })
      const datos = { monto: t.monto, origen: t.origen, destino: t.destino, fecha: t.fecha, notas: t.notas }
      return {
        datos,
        resumen: `Pasar ${money(t.monto)} de ${nombreMedio(t.origen)} a ${nombreMedio(t.destino)} el ${t.fecha}`,
        detalle: {
          monto: t.monto,
          sale_de: nombreMedio(t.origen),
          llega_a: nombreMedio(t.destino),
          fecha: t.fecha,
          notas: t.notas,
        },
        avisos: ["No es ingreso ni gasto: la utilidad y lo de los socios no cambian."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await registrarTraslado(admin, { userId: actor.userId, role: actor.role }, d)
      return { traslado_id: r.id, monto: r.monto, sale_de: nombreMedio(r.origen), llega_a: nombreMedio(r.destino), fecha: r.fecha }
    },
  }),

  operacion({
    nombre: "anular_traslado",
    titulo: "Anular un traslado entre cuentas",
    descripcion:
      "Anula un traslado registrado por error (no se borra: queda anulado, con su motivo, en la auditoria). " +
      "El id sale de la herramienta traslados.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      traslado_id: z.string().guid(),
      motivo: z.string().trim().min(3).max(300).describe("Por que se anula"),
    },
    previsualizar: async (admin, _actor, args) => {
      const { traslado, motivo } = await validarAnulacionTraslado(admin, String(args.traslado_id), String(args.motivo))
      const datos = { trasladoId: traslado.id, motivo }
      return {
        datos,
        resumen: `Anular el traslado de ${money(Number(traslado.monto))} de ${nombreMedio(traslado.metodo_origen)} a ${nombreMedio(traslado.metodo_destino)} del ${traslado.fecha}`,
        detalle: {
          monto: Number(traslado.monto),
          sale_de: nombreMedio(traslado.metodo_origen),
          llega_a: nombreMedio(traslado.metodo_destino),
          fecha: traslado.fecha,
          notas: traslado.notas,
          motivo,
        },
        avisos: ["La plata vuelve a contarse en la cuenta de donde salio."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const t = await anularTraslado(admin, { userId: actor.userId, role: actor.role }, d.trasladoId, d.motivo)
      return { traslado_id: t.id, anulado: true }
    },
  }),

  operacion({
    nombre: "cuenta_de_dinero",
    titulo: "Agregar, renombrar, ocultar o mostrar una cuenta de dinero",
    descripcion:
      "Administra la lista de cuentas de dinero (efectivo, Nequi, Banco Caja Social...), igual que Configuracion en la web. " +
      "crear: una cuenta nueva (nombre). renombrar: cambia solo el nombre que se ve (cuenta + nombre); los pagos de antes " +
      "siguen en la misma cuenta. ocultar: deja de ofrecerse para pagos nuevos sin tocar los de antes. mostrar: la vuelve a ofrecer. " +
      "Las cuentas nunca se borran.",
    roles: ["admin"],
    riesgo: "editar",
    schema: {
      accion: z.enum(ACCIONES_CUENTA),
      cuenta: z.string().trim().min(2).max(60).optional().describe("Cuenta a cambiar (clave o nombre actual). No va al crear."),
      nombre: z.string().trim().min(2).max(60).optional().describe("Nombre nuevo (al crear o renombrar)"),
    },
    previsualizar: async (admin, _actor, args) => {
      const medios = await cargarMediosPago(admin, { forzar: true })
      const accion = args.accion
      const nombre = String(args.nombre ?? "").replace(/\s+/g, " ").trim()

      if (accion === "crear") {
        if (!nombre) throw new OperacionMcpError("Indica el nombre de la cuenta nueva.")
        const repetida = resolverClaveMedio(nombre)
        if (repetida) throw new OperacionMcpError(`Ya existe la cuenta «${nombreMedio(repetida)}».`)
        return {
          datos: { accion, clave: "", nombre } as CambioCuenta,
          resumen: `Agregar la cuenta de dinero «${nombre}»`,
          detalle: { accion: "crear", nombre },
          avisos: ["Aparece de inmediato en todos los formularios de pago, en el conector y en la liquidacion."],
        }
      }

      const clave = resolverClaveMedio(String(args.cuenta ?? ""))
      if (!clave) {
        const lista = medios.map((m) => `${m.nombre} (${m.clave})`).join(", ")
        throw new OperacionMcpError(`No encontre la cuenta "${args.cuenta ?? ""}". Las cuentas son: ${lista}.`)
      }
      const medio = medios.find((m) => m.clave === clave)!

      if (accion === "renombrar") {
        if (!nombre) throw new OperacionMcpError("Indica el nombre nuevo.")
        if (nombre === medio.nombre) throw new OperacionMcpError(`La cuenta ya se llama «${nombre}».`)
        return {
          datos: { accion, clave, nombre } as CambioCuenta,
          resumen: `Cambiar el nombre de «${medio.nombre}» a «${nombre}»`,
          detalle: { accion: "renombrar", antes: medio.nombre, despues: nombre },
          avisos: ["Los pagos de antes quedan en la misma cuenta; solo cambia el nombre que se ve."],
        }
      }

      const activa = accion === "mostrar"
      if (medio.activo === activa) {
        throw new OperacionMcpError(`La cuenta «${medio.nombre}» ya esta ${activa ? "visible" : "oculta"}.`)
      }
      return {
        datos: { accion, clave, nombre: medio.nombre } as CambioCuenta,
        resumen: activa ? `Volver a mostrar la cuenta «${medio.nombre}»` : `Ocultar la cuenta «${medio.nombre}»`,
        detalle: { accion, cuenta: medio.nombre },
        avisos: activa ? [] : ["Ya no se ofrece para pagos nuevos; sus pagos de antes no cambian."],
      }
    },
    ejecutar: async (admin, _actor, d) => {
      if (d.accion === "crear") {
        const m = await crearMedioPago(admin, d.nombre)
        return { cuenta: m.nombre, clave: m.clave, creada: true }
      }
      if (d.accion === "renombrar") {
        const nombre = await renombrarMedioPago(admin, d.clave, d.nombre)
        return { clave: d.clave, nombre }
      }
      await cambiarMedioPagoActivo(admin, d.clave, d.accion === "mostrar")
      return { clave: d.clave, cuenta: d.nombre, activa: d.accion === "mostrar" }
    },
  }),
]
