import { z } from "zod"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import { previsualizarAbono, registrarAbono } from "@/lib/operaciones/abonos"
import { exigir, exigirMontoPositivo } from "@/lib/operaciones/errores"
import {
  CATEGORIAS_EGRESO,
  crearAnticipo,
  MODALIDADES_COBRO,
  crearCuentaCompleta,
  crearDonacion,
  crearEgreso,
  crearVentaExterna,
  validarCuentaCompleta,
} from "@/lib/operaciones/movimientos"
import {
  aplicarSaldoAFavor,
  previsualizarAplicarSaldo,
  saldoFavorDisponible,
} from "@/lib/operaciones/saldo-favor"
import { OperacionMcpError } from "../operaciones"
import {
  METODOS_PAGO,
  FECHA,
  money,
  operacion,
  resolverPersona,
  cuentasPendientesDe,
  type DefinicionOperacion,
} from "./comun"

// Operaciones que registran dinero: pagos, cuentas, egresos, ventas externas, donaciones, anticipos y saldo a favor.
// Cada una sigue el camino preparar -> confirmar de escritura-tools.ts.

export const OPERACIONES_DINERO: DefinicionOperacion[] = [
  operacion({
    nombre: "registrar_pago",
    titulo: "Registrar un pago o abono",
    descripcion:
      "Abona dinero a una cuenta existente. Usala cuando la persona reporte un pago o envie la foto de un comprobante. " +
      "Si el pago supera lo pendiente, el excedente queda como saldo a favor.",
    roles: ["admin", "caja"],
    schema: {
      persona: z.string().trim().min(1).max(160).describe("Nombre o codigo de quien paga"),
      monto: z.coerce.number().positive().max(100_000_000),
      metodo_pago: z.enum(METODOS_PAGO),
      cuenta_id: z.string().uuid().optional().describe("Id de la cuenta; si se omite se busca por concepto"),
      concepto: z.string().trim().max(160).optional().describe("Concepto de la cuenta a abonar"),
      fecha_pago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      exigirMontoPositivo(args.monto)
      const persona = await resolverPersona(admin, String(args.persona))
      let cuentaId: string | undefined = args.cuenta_id

      if (!cuentaId) {
        const cuentas = await cuentasPendientesDe(admin, persona.id)
        if (!cuentas.length) {
          throw new OperacionMcpError(
            `${persona.nombre} no tiene cuentas pendientes. Si el pago es por algo nuevo, primero crea la cuenta con preparar_cuenta.`
          )
        }
        const filtradas = args.concepto
          ? cuentas.filter((c) =>
              String(c.concepto).toLowerCase().includes(String(args.concepto).toLowerCase())
            )
          : cuentas
        if (filtradas.length === 1) cuentaId = filtradas[0].id
        else {
          const lista = (filtradas.length ? filtradas : cuentas)
            .map((c) => `${c.concepto} — pendiente ${money(c.pendiente)} (id ${c.id})`)
            .join("\n")
          throw new OperacionMcpError(
            `${persona.nombre} tiene varias cuentas pendientes. Indica cual con cuenta_id o un concepto mas preciso:\n${lista}`
          )
        }
      }

      const datos = {
        cuentaId,
        monto: Number(args.monto),
        metodoPago: String(args.metodo_pago),
        fechaPago: String(args.fecha_pago || fechaHoyBogota()),
        notas: args.notas ? String(args.notas) : null,
      }
      const previa = await previsualizarAbono(admin, datos)

      return {
        datos,
        resumen:
          `Registrar ${money(Number(args.monto))} de ${previa.personaNombre} en "${previa.concepto}" ` +
          `(${datos.metodoPago}, ${datos.fechaPago})`,
        detalle: {
          persona: previa.personaNombre,
          concepto: previa.concepto,
          cuenta_id: previa.cuentaId,
          metodo_pago: datos.metodoPago,
          fecha_pago: datos.fechaPago,
          valor_de_la_cuenta: previa.valorTotal,
          pendiente_antes: previa.pendienteAntes,
          se_aplica_a_la_cuenta: previa.montoAplicado,
          excedente_a_saldo_a_favor: previa.excedenteASaldoFavor,
          pendiente_despues: previa.pendienteDespues,
          estado_antes: previa.estadoAntes,
          estado_despues: previa.estadoDespues,
        },
        avisos: [
          previa.excedenteASaldoFavor > 0
            ? `El pago supera lo pendiente: ${money(previa.excedenteASaldoFavor)} quedaran como saldo a favor de ${previa.personaNombre}.`
            : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await registrarAbono(
        admin,
        { userId: actor.userId, role: actor.role },
        {
          cuentaId: String(d.cuentaId),
          monto: Number(d.monto),
          metodoPago: d.metodoPago ?? null,
          fechaPago: String(d.fechaPago),
          notas: d.notas ?? null,
        }
      )
      return {
        pago_id: r.pagoId,
        aplicado_a_la_cuenta: r.montoAplicado,
        excedente_a_saldo_a_favor: r.excedenteASaldoFavor,
        estado_de_la_cuenta: r.estadoDespues,
        saldo_favor_id: r.saldoFavorId,
      }
    },
  }),

  operacion({
    nombre: "cuenta",
    titulo: "Crear una cuenta por cobrar",
    descripcion:
      "Registra que a una persona se le cobra un concepto por cierto valor (ej: 'primer paso' $100.000). Hace todo lo " +
      "del formulario de la web: paquete coach (sesiones_coach), cortesia o cubierto por otro proceso/familiar " +
      "(modalidad, con valor 0, solo para paquetes coach), abono inicial en el mismo paso (si supera el valor, el " +
      "excedente va a saldo a favor) y la primera sesion ya dictada (fecha_sesion), que cae en ESTE paquete nuevo.",
    roles: ["admin", "caja"],
    schema: {
      persona: z.string().trim().min(1).max(160),
      concepto: z.string().trim().min(2).max(160),
      valor_total: z.coerce
        .number()
        .min(0)
        .max(100_000_000)
        .describe("Valor a cobrar. 0 solo con modalidad cortesia o cubierto_por_otro_proceso"),
      fecha_emision: FECHA.optional(),
      sesiones_coach: z.coerce
        .number()
        .int()
        .positive()
        .max(60)
        .optional()
        .describe("Si es una cuenta de sesiones coach, cuantas incluye (normalmente 1). Crea el paquete para poder descontarlas."),
      modalidad: z
        .enum(MODALIDADES_COBRO)
        .optional()
        .describe(
          "normal (por defecto), cortesia (regalada) o cubierto_por_otro_proceso (la paga otro proceso o un familiar). " +
            "Las dos ultimas solo para paquetes coach y con valor_total 0: la cuenta nace pagada y no genera deuda."
        ),
      abono_inicial: z.coerce.number().positive().max(100_000_000).optional().describe("Lo que ya pago al crearla"),
      metodo_pago: z.enum(METODOS_PAGO).optional().describe("Obligatorio si hay abono_inicial"),
      fecha_pago_inicial: FECHA.optional().describe("Fecha del abono inicial; por defecto, la de emision"),
      notas_pago: z.string().trim().max(300).optional(),
      fecha_sesion: FECHA.optional().describe("Si la primera sesion coach ya se dicto, su fecha"),
      evento_agenda_id: z
        .string()
        .trim()
        .max(128)
        .optional()
        .describe("Evento de la agenda de esa primera sesion, para enlazarla"),
    },
    previsualizar: async (admin, _actor, args) => {
      const persona = await resolverPersona(admin, String(args.persona))
      const fechaEmision = String(args.fecha_emision || fechaHoyBogota())
      if (args.abono_inicial && !args.metodo_pago) {
        throw new OperacionMcpError("Indica el metodo_pago del abono inicial.")
      }
      if (args.evento_agenda_id && !args.fecha_sesion) {
        throw new OperacionMcpError("Para enlazar un evento de la agenda indica tambien la fecha_sesion.")
      }

      const datos = {
        asistenteId: persona.id,
        concepto: String(args.concepto).trim(),
        valorTotal: Number(args.valor_total),
        fechaEmision,
        sesionesCoach: args.sesiones_coach ? Number(args.sesiones_coach) : null,
        modalidad: args.modalidad || "normal",
        abonoInicial: args.abono_inicial
          ? {
              monto: Number(args.abono_inicial),
              metodoPago: String(args.metodo_pago),
              fechaPago: String(args.fecha_pago_inicial || fechaEmision),
              notas: args.notas_pago ? String(args.notas_pago) : null,
            }
          : null,
        primeraSesion: args.fecha_sesion
          ? {
              fecha: String(args.fecha_sesion),
              eventoAgendaId: args.evento_agenda_id ? String(args.evento_agenda_id) : null,
            }
          : null,
      }
      const plan = await validarCuentaCompleta(admin, datos)
      const enCero = plan.cuenta.valorTotal === 0

      return {
        datos,
        resumen:
          `Crear cuenta "${plan.cuenta.concepto}" por ${money(plan.cuenta.valorTotal)} a ${persona.nombre}` +
          (plan.cuenta.sesiones ? ` (paquete de ${plan.cuenta.sesiones} sesión/es coach)` : "") +
          (plan.abono ? `, con abono inicial de ${money(plan.abono.monto)} (${plan.abono.metodoPago})` : "") +
          (plan.sesion ? `, y su primera sesion el ${plan.sesion.fecha}` : ""),
        detalle: {
          persona: persona.nombre,
          codigo: persona.codigo,
          concepto: plan.cuenta.concepto,
          modalidad: plan.cuenta.modalidad,
          valor_total: plan.cuenta.valorTotal,
          fecha_emision: plan.cuenta.fechaEmision,
          paquete_coach: plan.cuenta.sesiones
            ? `Se crea con ${plan.cuenta.sesiones} sesión/es, para poder descontarlas después.`
            : "No (cuenta normal)",
          abono_inicial: plan.abono
            ? {
                monto: plan.abono.monto,
                metodo_pago: plan.abono.metodoPago,
                fecha_pago: plan.abono.fechaPago,
                se_aplica_a_la_cuenta: plan.abono.montoAplicado,
                excedente_a_saldo_a_favor: plan.abono.excedente,
              }
            : "ninguno",
          primera_sesion: plan.sesion
            ? { fecha: plan.sesion.fecha, enlazada_a_evento_agenda: Boolean(plan.sesion.eventoAgendaId) }
            : "ninguna",
          pendiente_despues: plan.pendienteDespues,
          estado_despues: plan.estadoDespues,
        },
        avisos: [
          enCero
            ? `Cuenta en $0 (${plan.cuenta.modalidad === "cortesia" ? "cortesia" : "cubierta por otro proceso/familiar"}): ` +
              "nace pagada, no genera deuda ni cuenta como ingreso."
            : null,
          plan.abono && plan.abono.excedente > 0
            ? `El abono supera el valor: ${money(plan.abono.excedente)} quedaran como saldo a favor de ${persona.nombre}.`
            : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearCuentaCompleta(admin, { userId: actor.userId, role: actor.role }, d)
      return {
        cuenta_id: r.id,
        concepto: r.concepto,
        valor_total: r.valorTotal,
        modalidad: r.modalidad,
        estado: r.estado,
        paquete_coach_id: r.paqueteId,
        pago_id: r.abono?.pagoId ?? null,
        excedente_a_saldo_a_favor: r.abono?.excedenteASaldoFavor ?? 0,
        primera_sesion: r.sesion ? { fecha: r.sesion.fecha, sesiones_restantes: r.sesion.restantesDespues } : null,
      }
    },
  }),

  operacion({
    nombre: "egreso",
    titulo: "Registrar un egreso",
    descripcion: "Registra un gasto de la fundacion (arriendo, insumos, honorarios...).",
    roles: ["admin"],
    schema: {
      concepto: z.string().trim().min(2).max(200),
      monto: z.coerce.number().positive().max(100_000_000),
      categoria: z.enum(CATEGORIAS_EGRESO),
      metodo_pago: z.enum(METODOS_PAGO),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (_admin, _actor, args) => {
      exigirMontoPositivo(args.monto)
      exigir(
        (CATEGORIAS_EGRESO as readonly string[]).includes(String(args.categoria)),
        `La categoria debe ser una de: ${CATEGORIAS_EGRESO.join(", ")}.`
      )
      const datos = {
        concepto: String(args.concepto).trim(),
        monto: Number(args.monto),
        categoria: String(args.categoria),
        metodoPago: String(args.metodo_pago),
        fecha: String(args.fecha || fechaHoyBogota()),
        notas: args.notas ? String(args.notas) : null,
      }
      return {
        datos,
        resumen: `Registrar egreso "${datos.concepto}" por ${money(datos.monto)} (${datos.categoria})`,
        detalle: {
          concepto: datos.concepto,
          monto: datos.monto,
          categoria: datos.categoria,
          metodo_pago: datos.metodoPago,
          fecha: datos.fecha,
          notas: datos.notas,
        },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearEgreso(admin, { userId: actor.userId, role: actor.role }, d)
      return { egreso_id: r.id, monto: r.monto, concepto: r.concepto }
    },
  }),

  operacion({
    nombre: "venta_externa",
    titulo: "Registrar una venta externa",
    descripcion: "Registra una venta a alguien que no es asistente del programa.",
    roles: ["admin", "caja"],
    schema: {
      concepto: z.string().trim().min(2).max(200),
      monto: z.coerce.number().positive().max(100_000_000),
      metodo_pago: z.enum(METODOS_PAGO),
      comprador_nombre: z.string().trim().max(160).optional(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (_admin, _actor, args) => {
      exigirMontoPositivo(args.monto)
      const datos = {
        concepto: String(args.concepto).trim(),
        compradorNombre: args.comprador_nombre ? String(args.comprador_nombre).trim() : null,
        monto: Number(args.monto),
        metodoPago: String(args.metodo_pago),
        fecha: String(args.fecha || fechaHoyBogota()),
        notas: args.notas ? String(args.notas) : null,
      }
      return {
        datos,
        resumen:
          `Registrar venta externa "${datos.concepto}" por ${money(datos.monto)}` +
          (datos.compradorNombre ? ` a ${datos.compradorNombre}` : ""),
        detalle: {
          concepto: datos.concepto,
          comprador: datos.compradorNombre,
          monto: datos.monto,
          metodo_pago: datos.metodoPago,
          fecha: datos.fecha,
        },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearVentaExterna(admin, { userId: actor.userId, role: actor.role }, d)
      return { venta_id: r.id, monto: r.monto, concepto: r.concepto }
    },
  }),

  operacion({
    nombre: "donacion",
    titulo: "Registrar una donacion",
    descripcion: "Registra una donacion hecha por una persona del programa.",
    roles: ["admin", "caja"],
    schema: {
      persona: z.string().trim().min(1).max(160),
      monto: z.coerce.number().positive().max(100_000_000),
      metodo_pago: z.enum(METODOS_PAGO),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      exigirMontoPositivo(args.monto)
      const persona = await resolverPersona(admin, String(args.persona))
      const datos = {
        asistenteId: persona.id,
        monto: Number(args.monto),
        metodoPago: String(args.metodo_pago),
        fecha: String(args.fecha || fechaHoyBogota()),
        notas: args.notas ? String(args.notas) : null,
      }
      return {
        datos,
        resumen: `Registrar donacion de ${money(datos.monto)} de ${persona.nombre}`,
        detalle: {
          persona: persona.nombre,
          monto: datos.monto,
          metodo_pago: datos.metodoPago,
          fecha: datos.fecha,
        },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearDonacion(admin, { userId: actor.userId, role: actor.role }, d)
      return { donacion_id: r.id, monto: r.monto }
    },
  }),

  operacion({
    nombre: "anticipo",
    titulo: "Registrar un anticipo (saldo a favor)",
    descripcion:
      "Registra dinero que la persona entrega por adelantado y queda como saldo a favor suyo, para aplicarlo despues a sus cuentas.",
    roles: ["admin", "caja"],
    schema: {
      persona: z.string().trim().min(1).max(160),
      monto: z.coerce.number().positive().max(100_000_000),
      metodo_pago: z.enum(METODOS_PAGO),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      exigirMontoPositivo(args.monto)
      const persona = await resolverPersona(admin, String(args.persona))
      const datos = {
        asistenteId: persona.id,
        monto: Number(args.monto),
        metodoPago: String(args.metodo_pago),
        fecha: String(args.fecha || fechaHoyBogota()),
        notas: args.notas ? String(args.notas) : null,
      }
      return {
        datos,
        resumen: `Registrar anticipo de ${money(datos.monto)} a favor de ${persona.nombre}`,
        detalle: {
          persona: persona.nombre,
          monto: datos.monto,
          metodo_pago: datos.metodoPago,
          fecha: datos.fecha,
          efecto: "Queda como saldo a favor, disponible para aplicar a sus cuentas.",
        },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearAnticipo(admin, { userId: actor.userId, role: actor.role }, d)
      return { movimiento_id: r.id, monto: r.monto }
    },
  }),

  operacion({
    nombre: "aplicar_saldo_favor",
    titulo: "Aplicar saldo a favor a una deuda",
    descripcion:
      "Usa el saldo a favor que ya tiene la persona para pagar una de sus cuentas pendientes. No entra dinero nuevo: " +
      "se consume el saldo existente.",
    roles: ["admin", "caja"],
    schema: {
      persona: z.string().trim().min(1).max(160),
      monto: z.coerce.number().positive().max(100_000_000),
      cuenta_id: z.string().uuid().optional().describe("Cuenta a la que se aplica; si se omite se busca por concepto"),
      concepto: z.string().trim().max(160).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      exigirMontoPositivo(args.monto)
      const persona = await resolverPersona(admin, String(args.persona))

      const disponible = await saldoFavorDisponible(admin, persona.id)
      if (disponible <= 0) {
        throw new OperacionMcpError(`${persona.nombre} no tiene saldo a favor disponible.`)
      }

      let cuentaId: string | undefined = args.cuenta_id
      if (!cuentaId) {
        const cuentas = await cuentasPendientesDe(admin, persona.id)
        if (!cuentas.length) throw new OperacionMcpError(`${persona.nombre} no tiene cuentas pendientes.`)
        const filtradas = args.concepto
          ? cuentas.filter((c) =>
              String(c.concepto).toLowerCase().includes(String(args.concepto).toLowerCase())
            )
          : cuentas
        if (filtradas.length === 1) cuentaId = filtradas[0].id
        else {
          const lista = (filtradas.length ? filtradas : cuentas)
            .map((c) => `${c.concepto} — pendiente ${money(c.pendiente)} (id ${c.id})`)
            .join("\n")
          throw new OperacionMcpError(
            `${persona.nombre} tiene varias cuentas pendientes. Indica cual con cuenta_id o un concepto mas preciso:\n${lista}`
          )
        }
      }

      const datos = { cuentaId, asistenteId: persona.id, monto: Number(args.monto) }
      const previa = await previsualizarAplicarSaldo(admin, datos)

      return {
        datos,
        resumen:
          `Aplicar ${money(previa.seAplica)} del saldo a favor de ${previa.personaNombre} ` +
          `a la cuenta "${previa.concepto}"`,
        detalle: {
          persona: previa.personaNombre,
          concepto: previa.concepto,
          cuenta_id: previa.cuentaId,
          saldo_disponible_antes: previa.saldoDisponibleAntes,
          pendiente_antes: previa.pendienteAntes,
          se_aplica: previa.seAplica,
          saldo_disponible_despues: previa.saldoDisponibleDespues,
          pendiente_despues: previa.pendienteDespues,
        },
        avisos: [
          previa.seAplica < Number(args.monto)
            ? `Se aplicara solo ${money(previa.seAplica)} porque es lo que queda pendiente en esa cuenta.`
            : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await aplicarSaldoAFavor(admin, { userId: actor.userId, role: actor.role }, d)
      return {
        aplicado: r.seAplica,
        saldo_disponible_despues: r.saldoDisponibleDespues,
        pendiente_despues: r.pendienteDespues,
      }
    },
  }),
]
