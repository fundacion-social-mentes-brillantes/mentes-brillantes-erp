import { z } from "zod"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import { assertFechaEditable } from "@/lib/utils/periodos"
import { nombreMedio } from "@/lib/medios-pago"
import { exigirMedioPago, exigirMontoPositivo } from "@/lib/operaciones/errores"
import { CATEGORIAS_EGRESO } from "@/lib/operaciones/movimientos"
import {
  cambiarEstadoTaller,
  cancelarInscripcion,
  inscribirEnTaller,
  marcarAsistencia,
  registrarGastoTaller,
  registrarPagoTaller,
  totalPagado,
} from "@/lib/operaciones/talleres"
import {
  ESTADOS_TALLER,
  ETIQUETA_ESTADO_TALLER,
  normalizarCorreo,
  normalizarDocumento,
  normalizarEdad,
  kitLegible,
  normalizarKit,
  normalizarTelefono,
  preguntasGuardadas,
  validarRespuestas,
  valorYKitDeInscripcion,
  type EstadoTaller,
} from "@/lib/operaciones/talleres-reglas"
import { mensajeDeError } from "@/lib/utils/errores"
import { OperacionMcpError } from "../operaciones"
import { resolverInscripcion, resolverTaller } from "../talleres-mcp"
import { FECHA, METODO_PAGO, enmascarar, money, operacion, resolverPersona, type DefinicionOperacion } from "./comun"

// Talleres por el conector: lo mismo que la pagina de cada taller en la web y
// con los mismos permisos (talleres/actions.ts): inscribir, cobrar, marcar
// llegada y cancelar lo hacen admin y caja; los gastos y el estado del taller,
// solo el admin. Las reglas viven en lib/operaciones/talleres.ts.

const TALLER = z.string().trim().min(2).max(160).describe("Nombre del taller, su enlace o su id (herramienta talleres)")
const PERSONA_INSCRITA = z.string().trim().min(2).max(160).optional().describe("Nombre de la persona inscrita")
const INSCRIPCION_ID = z.string().guid().optional().describe("inscripcion_id (herramienta taller); evita confusiones con nombres parecidos")

/** El pago que acompaña una operacion, revisado sin escribir. */
async function revisarPago(
  admin: Parameters<typeof exigirMedioPago>[0],
  args: { monto: unknown; metodo: unknown; fecha: unknown },
  pendiente: number,
  quien: string
) {
  const monto = exigirMontoPositivo(args.monto)
  if (pendiente <= 0) throw new OperacionMcpError(`${quien} ya pagó todo el taller.`)
  if (monto > pendiente) {
    throw new OperacionMcpError(
      `El pago supera lo que falta (${money(pendiente)}). Registra solo lo que falta, o pide al admin que suba el valor a pagar.`
    )
  }
  const metodoPago = await exigirMedioPago(admin, args.metodo || "efectivo")
  const fecha = String(args.fecha || fechaHoyBogota())
  const error = await assertFechaEditable(admin, fecha, "Registrar el pago")
  if (error) throw new OperacionMcpError(error)
  return { monto, metodoPago, fecha }
}

export const OPERACIONES_TALLERES: DefinicionOperacion[] = [
  operacion({
    nombre: "inscripcion_taller",
    titulo: "Inscribir a alguien en un taller",
    descripcion:
      "Inscribe a una persona en un taller, como el formulario de la web (antes del taller o en la puerta). Puede traer " +
      "el primer pago en el mismo paso. El valor a pagar es el del taller; solo el admin puede poner otro (descuento o cortesia). " +
      "Si el taller tiene preguntas propias, sus ids salen de la herramienta taller.",
    roles: ["admin", "caja"],
    riesgo: "crear",
    schema: {
      taller: TALLER,
      nombre: z.string().trim().min(2).max(120),
      cedula: z.string().trim().max(30).optional().describe("Cedula, o TI y el numero si es una tarjeta de identidad"),
      edad: z.coerce.number().int().min(0).max(120).optional().describe("Anos cumplidos"),
      kit: z.boolean().optional().describe("true si va con el kit del taller, false si va sin kit"),
      celular: z.string().trim().max(30).optional(),
      correo: z.string().trim().max(160).optional(),
      valor_acordado: z.coerce.number().min(0).max(100_000_000).optional().describe("Solo admin: lo que pagara si no es el precio del taller"),
      persona_erp: z.string().trim().max(160).optional().describe("Si ya esta en el ERP, su nombre o codigo, para enlazarla"),
      llego: z.boolean().optional().describe("true si se inscribe en la puerta y ya llego"),
      respuestas: z.record(z.string(), z.string().max(2000)).optional().describe("Respuestas a las preguntas del taller: { id_pregunta: respuesta }"),
      pago_monto: z.coerce.number().positive().max(100_000_000).optional().describe("Lo que paga ya, si paga algo"),
      pago_metodo: METODO_PAGO.optional().describe("Cuenta del pago; por defecto efectivo"),
      pago_fecha: FECHA.optional(),
      notas: z.string().trim().max(1000).optional(),
    },
    previsualizar: async (admin, actor, args) => {
      const taller = await resolverTaller(admin, args.taller)
      if (taller.estado === "cancelado") throw new OperacionMcpError("Este taller está cancelado.")

      const documento = normalizarDocumento(args.cedula)
      const edad = normalizarEdad(args.edad)
      const kitPedido = normalizarKit(args.kit)
      const telefono = normalizarTelefono(args.celular)
      const correo = normalizarCorreo(args.correo)
      const respuestas = validarRespuestas(preguntasGuardadas(taller.preguntas), args.respuestas ?? {})

      if (documento) {
        const { data: repetidas } = await admin
          .from("taller_inscripciones")
          .select("nombre")
          .eq("taller_id", taller.id)
          .eq("documento", documento)
          .neq("estado", "cancelado")
        if ((repetidas ?? []).length > 0) {
          throw new OperacionMcpError(`Esa cédula ya está inscrita en este taller (${repetidas![0].nombre}).`)
        }
      }

      // Lo del taller (desde los 16 el valor normal y con kit; un niño, segun el kit), como en la web.
      const precio = Number(taller.precio || 0)
      const { valor: valorDelTaller, kit } = valorYKitDeInscripcion(taller, { documento, edad, kit: kitPedido })
      let valorAcordado = valorDelTaller
      if (args.valor_acordado !== undefined && Number(args.valor_acordado) !== valorDelTaller) {
        if (actor.role !== "admin") throw new OperacionMcpError("Solo el administrador puede cambiar el valor a pagar.")
        valorAcordado = Number(args.valor_acordado)
      }

      const enlazada = args.persona_erp ? await resolverPersona(admin, args.persona_erp) : null
      const pago =
        args.pago_monto !== undefined
          ? await revisarPago(admin, { monto: args.pago_monto, metodo: args.pago_metodo, fecha: args.pago_fecha }, valorAcordado, args.nombre)
          : null

      const { count } = await admin
        .from("taller_inscripciones")
        .select("id", { count: "exact", head: true })
        .eq("taller_id", taller.id)
        .neq("estado", "cancelado")
      const lleno = taller.cupo !== null && (count ?? 0) >= taller.cupo

      const datos = {
        tallerId: taller.id,
        tallerNombre: taller.nombre,
        nombre: args.nombre,
        documento,
        edad,
        kit,
        telefono,
        correo,
        respuestas,
        valorAcordado,
        asistenteId: enlazada?.id ?? null,
        llego: Boolean(args.llego),
        notas: args.notas ?? null,
        pago,
      }
      return {
        datos,
        resumen:
          `Inscribir a ${args.nombre} en «${taller.nombre}» (a pagar ${money(valorAcordado)})` +
          (pago ? ` con un pago de ${money(pago.monto)} por ${nombreMedio(pago.metodoPago)}` : ""),
        detalle: {
          taller: taller.nombre,
          nombre: args.nombre,
          identificacion: documento ? enmascarar(documento) : null,
          edad,
          kit: kitLegible(kit) || null,
          contacto_movil: telefono ? enmascarar(telefono) : null,
          contacto_mail: correo ? enmascarar(correo) : null,
          valor_a_pagar: valorAcordado,
          enlazada_con: enlazada ? `${enlazada.nombre} (codigo ${enlazada.codigo})` : null,
          ya_llego: Boolean(args.llego),
          pago: pago ? { monto: pago.monto, cuenta: nombreMedio(pago.metodoPago), fecha: pago.fecha } : null,
          notas: args.notas ?? null,
        },
        avisos: [
          lleno ? `OJO: el taller ya tiene ${count} inscritos y su cupo es ${taller.cupo}.` : null,
          taller.estado !== "abierto" ? `El taller está «${ETIQUETA_ESTADO_TALLER[taller.estado as EstadoTaller] ?? taller.estado}».` : null,
          valorDelTaller !== precio ? `Va como niño ${kitLegible(kit).toLowerCase()}: paga ${money(valorDelTaller)}.` : null,
          valorAcordado !== valorDelTaller ? `Paga ${money(valorAcordado)} en vez de lo del taller (${money(valorDelTaller)}).` : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const erp = { userId: actor.userId, role: actor.role }
      const inscrita = await inscribirEnTaller(admin, erp, {
        tallerId: d.tallerId,
        nombre: d.nombre,
        documento: d.documento,
        edad: d.edad,
        kit: d.kit,
        telefono: d.telefono,
        correo: d.correo,
        respuestas: d.respuestas,
        valorAcordado: d.valorAcordado,
        asistenteId: d.asistenteId,
        origen: d.llego ? "puerta" : "manual",
        asistio: d.llego,
        notas: d.notas,
      })
      const resultado: Record<string, unknown> = {
        inscripcion_id: inscrita.id,
        boleta: inscrita.codigoBoleta,
        taller: d.tallerNombre,
        valor_a_pagar: inscrita.valorAcordado,
      }
      if (!d.pago) return resultado
      // Igual que en la web: si el pago falla, la inscripcion ya quedo y se avisa.
      try {
        const venta = await registrarPagoTaller(admin, erp, {
          inscripcionId: inscrita.id,
          monto: d.pago.monto,
          metodoPago: d.pago.metodoPago,
          fecha: d.pago.fecha,
        })
        return { ...resultado, pago_registrado: d.pago.monto, falta: venta.pendienteDespues }
      } catch (e) {
        return { ...resultado, pago_registrado: 0, aviso: `La inscripción quedó, pero el pago no se registró: ${mensajeDeError(e, "error desconocido")}` }
      }
    },
  }),

  operacion({
    nombre: "pago_taller",
    titulo: "Registrar un pago o abono de un taller",
    descripcion:
      "Registra lo que pago una persona inscrita en un taller (todo o un abono). Entra como venta externa del periodo, " +
      "como en la web. No se acepta mas de lo que le falta.",
    roles: ["admin", "caja"],
    riesgo: "crear",
    schema: {
      taller: TALLER,
      persona: PERSONA_INSCRITA,
      inscripcion_id: INSCRIPCION_ID,
      monto: z.coerce.number().positive().max(100_000_000),
      metodo_pago: METODO_PAGO,
      fecha: FECHA.optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const taller = await resolverTaller(admin, args.taller)
      const inscrita = await resolverInscripcion(admin, taller.id, { inscripcionId: args.inscripcion_id, persona: args.persona })
      if (inscrita.estado === "cancelado") throw new OperacionMcpError("Esa inscripción está cancelada.")
      const pagado = await totalPagado(admin, inscrita.id)
      const pendiente = Math.max(0, Number(inscrita.valor_acordado || 0) - pagado)
      const pago = await revisarPago(admin, { monto: args.monto, metodo: args.metodo_pago, fecha: args.fecha }, pendiente, inscrita.nombre)
      const datos = { inscripcionId: inscrita.id, ...pago, notas: args.notas ?? null }
      return {
        datos,
        resumen: `Registrar ${money(pago.monto)} de ${inscrita.nombre} para «${taller.nombre}» por ${nombreMedio(pago.metodoPago)}`,
        detalle: {
          taller: taller.nombre,
          persona: inscrita.nombre,
          valor_a_pagar: Number(inscrita.valor_acordado),
          ya_pagado: pagado,
          este_pago: pago.monto,
          queda_debiendo: pendiente - pago.monto,
          cuenta: nombreMedio(pago.metodoPago),
          fecha: pago.fecha,
          notas: datos.notas,
        },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const venta = await registrarPagoTaller(admin, { userId: actor.userId, role: actor.role }, d)
      return { venta_externa_id: venta.id, pagado: venta.pagadoDespues, falta: venta.pendienteDespues }
    },
  }),

  operacion({
    nombre: "gasto_taller",
    titulo: "Registrar un gasto de un taller",
    descripcion:
      "Registra un gasto del taller (refrigerios, materiales, el pago a un tallerista externo...). Es un egreso de la " +
      "fundacion marcado con el taller, como en la web.",
    roles: ["admin"],
    riesgo: "crear",
    schema: {
      taller: TALLER,
      concepto: z.string().trim().min(2).max(200).describe("En que se gasto"),
      monto: z.coerce.number().positive().max(100_000_000),
      categoria: z.enum(CATEGORIAS_EGRESO).optional().describe("Por defecto Otros"),
      metodo_pago: METODO_PAGO,
      fecha: FECHA.optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const taller = await resolverTaller(admin, args.taller)
      const monto = exigirMontoPositivo(args.monto)
      const metodoPago = await exigirMedioPago(admin, args.metodo_pago)
      const fecha = String(args.fecha || fechaHoyBogota())
      const error = await assertFechaEditable(admin, fecha, "Registrar el gasto")
      if (error) throw new OperacionMcpError(error)
      const datos = {
        tallerId: taller.id,
        concepto: args.concepto,
        monto,
        categoria: args.categoria ?? "Otros",
        metodoPago,
        fecha,
        notas: args.notas ?? null,
      }
      return {
        datos,
        resumen: `Registrar gasto de «${taller.nombre}»: ${args.concepto} por ${money(monto)} (${nombreMedio(metodoPago)})`,
        detalle: {
          taller: taller.nombre,
          concepto: `${taller.nombre} · ${args.concepto}`,
          monto,
          categoria: datos.categoria,
          cuenta: nombreMedio(metodoPago),
          fecha,
          notas: datos.notas,
        },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await registrarGastoTaller(admin, { userId: actor.userId, role: actor.role }, d)
      return { egreso_id: r.id, monto: r.monto, concepto: r.concepto }
    },
  }),

  operacion({
    nombre: "llegada_taller",
    titulo: "Marcar quien llego a un taller",
    descripcion: "Marca que una persona inscrita llego al taller (o lo desmarca con llego=false). No toca plata.",
    roles: ["admin", "caja"],
    riesgo: "editar",
    schema: {
      taller: TALLER,
      persona: PERSONA_INSCRITA,
      inscripcion_id: INSCRIPCION_ID,
      llego: z.boolean().optional().describe("Por defecto true"),
    },
    previsualizar: async (admin, _actor, args) => {
      const taller = await resolverTaller(admin, args.taller)
      const inscrita = await resolverInscripcion(admin, taller.id, { inscripcionId: args.inscripcion_id, persona: args.persona })
      if (inscrita.estado === "cancelado") throw new OperacionMcpError("Esa inscripción está cancelada.")
      const llego = args.llego ?? true
      if (inscrita.asistio === llego) {
        throw new OperacionMcpError(`${inscrita.nombre} ya está marcada como que ${llego ? "llegó" : "no llegó"}.`)
      }
      return {
        datos: { inscripcionId: inscrita.id, llego },
        resumen: `${llego ? "Marcar que llegó" : "Quitar la llegada de"} ${inscrita.nombre} a «${taller.nombre}»`,
        detalle: { taller: taller.nombre, persona: inscrita.nombre, llego },
      }
    },
    ejecutar: async (admin, _actor, d) => {
      const r = await marcarAsistencia(admin, d.inscripcionId, d.llego)
      return { inscripcion_id: r.id, llego: r.asistio }
    },
  }),

  operacion({
    nombre: "estado_taller",
    titulo: "Cambiar el estado de un taller",
    descripcion:
      "Abre o cierra las inscripciones de un taller, o lo marca como realizado, cancelado o en borrador. " +
      "Abierto = la invitacion publica deja inscribirse.",
    roles: ["admin"],
    riesgo: "editar",
    schema: {
      taller: TALLER,
      estado: z.enum(ESTADOS_TALLER),
    },
    previsualizar: async (admin, _actor, args) => {
      const taller = await resolverTaller(admin, args.taller)
      if (taller.estado === args.estado) {
        throw new OperacionMcpError(`El taller ya está «${ETIQUETA_ESTADO_TALLER[args.estado]}».`)
      }
      const antes = ETIQUETA_ESTADO_TALLER[taller.estado as EstadoTaller] ?? taller.estado
      return {
        datos: { tallerId: taller.id, estado: args.estado },
        resumen: `Pasar «${taller.nombre}» de «${antes}» a «${ETIQUETA_ESTADO_TALLER[args.estado]}»`,
        detalle: { taller: taller.nombre, antes, despues: ETIQUETA_ESTADO_TALLER[args.estado] },
        avisos: [
          args.estado === "abierto" ? "La invitación queda abierta: cualquiera con el enlace se puede inscribir." : null,
          taller.estado === "abierto" ? "La invitación deja de recibir inscripciones." : null,
        ],
      }
    },
    ejecutar: async (admin, _actor, d) => {
      const r = await cambiarEstadoTaller(admin, d.tallerId, d.estado)
      return { taller_id: r.id, estado: ETIQUETA_ESTADO_TALLER[r.estado as EstadoTaller] }
    },
  }),

  operacion({
    nombre: "cancelar_inscripcion_taller",
    titulo: "Cancelar la inscripcion de alguien a un taller",
    descripcion:
      "Cancela la inscripcion de alguien que no va a ir (deja de deber). Si ya pago algo no se deja: o se le devolvio " +
      "la plata (y el admin anula primero ese pago) o se queda inscrita como que no llego.",
    roles: ["admin", "caja"],
    // No es "destructiva" (eso es solo del admin): la inscripcion no se borra,
    // queda cancelada con su rastro, y no se deja si ya pago algo.
    riesgo: "editar",
    schema: {
      taller: TALLER,
      persona: PERSONA_INSCRITA,
      inscripcion_id: INSCRIPCION_ID,
      motivo: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const taller = await resolverTaller(admin, args.taller)
      const inscrita = await resolverInscripcion(admin, taller.id, { inscripcionId: args.inscripcion_id, persona: args.persona })
      if (inscrita.estado === "cancelado") throw new OperacionMcpError("Esa inscripción ya está cancelada.")
      const pagado = await totalPagado(admin, inscrita.id)
      if (pagado > 0) {
        throw new OperacionMcpError(
          `${inscrita.nombre} ya pagó ${money(pagado)}. Si se le devolvió la plata, el admin anula primero ese pago; si no, déjala inscrita.`
        )
      }
      return {
        datos: { inscripcionId: inscrita.id, motivo: args.motivo ?? null },
        resumen: `Cancelar la inscripción de ${inscrita.nombre} a «${taller.nombre}»`,
        detalle: { taller: taller.nombre, persona: inscrita.nombre, debia: Number(inscrita.valor_acordado), motivo: args.motivo ?? null },
        avisos: ["Deja de contar en lo que se espera recoger del taller."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await cancelarInscripcion(admin, { userId: actor.userId, role: actor.role }, d.inscripcionId, d.motivo)
      return { inscripcion_id: r.id, cancelada: true }
    },
  }),
]
