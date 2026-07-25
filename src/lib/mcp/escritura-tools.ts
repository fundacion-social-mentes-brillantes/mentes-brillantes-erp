import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { createAdminClient } from "@/lib/supabase/admin"
import { searchPerson } from "@/lib/telegram-cajero/tools"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import { calcularPendienteCuenta, toSafeNumber } from "@/lib/utils/contable"
import { previsualizarAbono, registrarAbono } from "@/lib/operaciones/abonos"
import { OperacionError, exigir, exigirMontoPositivo } from "@/lib/operaciones/errores"
import {
  CATEGORIAS_EGRESO,
  crearAnticipo,
  crearCuenta,
  crearDonacion,
  crearEgreso,
  crearVentaExterna,
} from "@/lib/operaciones/movimientos"
import {
  aplicarSaldoAFavor,
  previsualizarAplicarSaldo,
  previsualizarReversoAbono,
  previsualizarReversoAnticipo,
  revertirAbonoConSaldo,
  revertirAnticipo,
  saldoFavorDisponible,
  corregirMontoPago,
  pagarDeudasConSaldo,
  previsualizarCorreccionMonto,
  previsualizarPagarDeudasConSaldo,
} from "@/lib/operaciones/saldo-favor"
import {
  editarSesionCoach,
  eliminarSesionCoach,
  previsualizarEdicionSesion,
  previsualizarEliminacionSesion,
  previsualizarSesionCoach,
  registrarSesionCoach,
} from "@/lib/operaciones/coach"
import {
  TIPOS_ANULABLES,
  TIPOS_EDITABLES,
  anularMovimiento,
  editarMovimiento,
  eliminarMovimiento,
  previsualizarAnulacion,
  previsualizarEdicion,
  previsualizarEliminacion,
} from "@/lib/operaciones/anulaciones"
import {
  cambiarEstadoPersona,
  crearPersona,
  editarPersona,
  eliminarPersona,
  previsualizarEliminacionPersona,
} from "@/lib/operaciones/personas"
import {
  editarValorCuenta,
  eliminarCuenta,
  previsualizarEdicionValorCuenta,
  previsualizarEliminacionCuenta,
} from "@/lib/operaciones/cuentas"
import {
  buscarSocio,
  cambiarEstadoSocio,
  cerrarLiquidacion,
  crearAdelanto,
  crearPeriodo,
  crearSocio,
  cambiarFechaFinPeriodo,
  editarSocio,
  porcentajeTotalSocios,
  validarAdelanto,
  validarCambioFechaFin,
  validarCierreLiquidacion,
  validarPeriodoNuevo,
} from "@/lib/operaciones/administracion"
import { executeTool } from "./erp-tools"
import { MCP_PRIMARY_SCOPE } from "./constants"
import {
  OperacionMcpError,
  TTL_BORRADOR_MINUTOS,
  buscarEjecucionReciente,
  cancelarBorrador,
  crearBorrador,
  huellaOperacion,
  marcarEjecutado,
  marcarFallido,
  reclamarBorrador,
} from "./operaciones"

// Herramientas de ESCRITURA del MCP.
//
// Todas siguen el mismo camino: preparar_<algo> calcula y MUESTRA lo que
// pasaria (sin escribir), y confirmar_operacion ejecuta. Definirlas en un
// registro hace que cada operacion nueva herede los mismos candados: rol,
// borrador de un solo uso, caducidad, aviso de duplicado y auditoria.

const SECURITY_SCHEMES = [{ type: "oauth2", scopes: [MCP_PRIMARY_SCOPE] }] as const

const ANOTACIONES_BORRADOR = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const

const ANOTACIONES_ESCRITURA = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const

const METODOS_PAGO = ["efectivo", "nequi", "daviplata", "otro"] as const

type Rol = "admin" | "caja"
type Actor = { userId: string; role: Rol; email: string }

type Preparado = {
  resumen: string
  detalle: Record<string, unknown>
  datos: Record<string, unknown>
  avisos?: Array<string | null>
}

type DefinicionOperacion = {
  nombre: string
  titulo: string
  descripcion: string
  roles: Rol[]
  /** "destructiva" exige confirmacion reforzada al ejecutar. */
  riesgo?: "crear" | "editar" | "destructiva"
  schema: Record<string, z.ZodTypeAny>
  previsualizar: (admin: any, actor: Actor, args: any) => Promise<Preparado>
  ejecutar: (admin: any, actor: Actor, datos: any) => Promise<Record<string, unknown>>
}

const money = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`

function actorDe(extra: any): Actor {
  const info = extra?.authInfo?.extra
  return { userId: String(info?.sub || ""), role: info?.role, email: String(info?.email || "") }
}

function exigirRol(actor: Actor, permitidos: Rol[]) {
  if (!permitidos.includes(actor.role)) {
    throw new OperacionMcpError(
      `Tu rol (${actor.role}) no puede hacer esta operacion. Requiere: ${permitidos.join(" o ")}.`
    )
  }
}

async function resolverPersona(admin: any, persona: string) {
  const res: any = await searchPerson(admin, persona, 6)
  if (res.status === "error") throw new OperacionMcpError("No se pudo buscar la persona.")
  const filas = Array.isArray(res.data) ? res.data : []
  if (!filas.length) throw new OperacionMcpError(`No encontre a "${persona}" en el ERP.`)
  if (filas.length > 1) {
    const opciones = filas.map((f: any) => `${f.nombre} (codigo ${f.codigo})`).join(" | ")
    throw new OperacionMcpError(
      `Hay varias personas que coinciden con "${persona}". Indica el codigo exacto: ${opciones}`
    )
  }
  return filas[0]
}

async function cuentasPendientesDe(admin: any, asistenteId: string) {
  const { data, error } = await admin
    .from("cuentas_por_cobrar")
    .select("id, concepto, valor_total, estado, fecha_emision, pagos_abonos(id, monto, estado, notas, origen_fondos)")
    .eq("asistente_id", asistenteId)
    .in("estado", ["pendiente", "parcial"])
    .order("fecha_emision", { ascending: true })

  if (error) throw new OperacionMcpError("No se pudieron leer las cuentas de la persona.")
  return (data || []).map((c: any) => ({
    id: c.id,
    concepto: c.concepto,
    pendiente: calcularPendienteCuenta(toSafeNumber(c.valor_total), c.pagos_abonos),
  }))
}

// ------------------------------------------------------------- operaciones

const OPERACIONES: DefinicionOperacion[] = [
  {
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
          ? cuentas.filter((c: any) =>
              String(c.concepto).toLowerCase().includes(String(args.concepto).toLowerCase())
            )
          : cuentas
        if (filtradas.length === 1) cuentaId = filtradas[0].id
        else {
          const lista = (filtradas.length ? filtradas : cuentas)
            .map((c: any) => `${c.concepto} — pendiente ${money(c.pendiente)} (id ${c.id})`)
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
      const previa = await previsualizarAbono(admin, datos as any)

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
  },

  {
    nombre: "cuenta",
    titulo: "Crear una cuenta por cobrar",
    descripcion:
      "Registra que a una persona se le cobra un concepto por cierto valor (ej: 'primer paso' $100.000). " +
      "Usala antes de registrar un pago cuando el concepto todavia no existe.",
    roles: ["admin", "caja"],
    schema: {
      persona: z.string().trim().min(1).max(160),
      concepto: z.string().trim().min(2).max(160),
      valor_total: z.coerce.number().positive().max(100_000_000),
      fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      sesiones_coach: z.coerce
        .number()
        .int()
        .positive()
        .max(60)
        .optional()
        .describe("Si es una cuenta de sesiones coach, cuantas incluye (normalmente 1). Crea el paquete para poder descontarlas."),
    },
    previsualizar: async (admin, _actor, args) => {
      exigirMontoPositivo(args.valor_total, "El valor de la cuenta")
      const persona = await resolverPersona(admin, String(args.persona))
      const datos = {
        asistenteId: persona.id,
        concepto: String(args.concepto).trim(),
        valorTotal: Number(args.valor_total),
        fechaEmision: String(args.fecha_emision || fechaHoyBogota()),
        sesionesCoach: args.sesiones_coach ? Number(args.sesiones_coach) : null,
      }
      return {
        datos,
        resumen:
          `Crear cuenta "${datos.concepto}" por ${money(datos.valorTotal)} a ${persona.nombre}` +
          (datos.sesionesCoach ? ` (paquete de ${datos.sesionesCoach} sesión/es coach)` : ""),
        detalle: {
          persona: persona.nombre,
          codigo: persona.codigo,
          concepto: datos.concepto,
          valor_total: datos.valorTotal,
          fecha_emision: datos.fechaEmision,
          estado_inicial: "pendiente",
          paquete_coach: datos.sesionesCoach
            ? `Se crea con ${datos.sesionesCoach} sesión/es, para poder descontarlas después.`
            : "No (cuenta normal)",
        },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearCuenta(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { cuenta_id: r.id, concepto: r.concepto, valor_total: r.valorTotal, paquete_coach_id: r.paqueteId }
    },
  },

  {
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
      const r = await crearEgreso(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { egreso_id: r.id, monto: r.monto, concepto: r.concepto }
    },
  },

  {
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
      const r = await crearVentaExterna(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { venta_id: r.id, monto: r.monto, concepto: r.concepto }
    },
  },

  {
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
      const r = await crearDonacion(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { donacion_id: r.id, monto: r.monto }
    },
  },

  {
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
      const r = await crearAnticipo(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { movimiento_id: r.id, monto: r.monto }
    },
  },
  {
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
          ? cuentas.filter((c: any) =>
              String(c.concepto).toLowerCase().includes(String(args.concepto).toLowerCase())
            )
          : cuentas
        if (filtradas.length === 1) cuentaId = filtradas[0].id
        else {
          const lista = (filtradas.length ? filtradas : cuentas)
            .map((c: any) => `${c.concepto} — pendiente ${money(c.pendiente)} (id ${c.id})`)
            .join("\n")
          throw new OperacionMcpError(
            `${persona.nombre} tiene varias cuentas pendientes. Indica cual con cuenta_id o un concepto mas preciso:\n${lista}`
          )
        }
      }

      const datos = { cuentaId, asistenteId: persona.id, monto: Number(args.monto) }
      const previa = await previsualizarAplicarSaldo(admin, datos as any)

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
      const r = await aplicarSaldoAFavor(admin, { userId: actor.userId, role: actor.role }, d as any)
      return {
        aplicado: r.seAplica,
        saldo_disponible_despues: r.saldoDisponibleDespues,
        pendiente_despues: r.pendienteDespues,
      }
    },
  },

  {
    nombre: "sesion_coach",
    titulo: "Registrar una sesion coach",
    descripcion:
      "Registra una sesion de coach realizada. Descuenta del paquete mas antiguo que tenga cupo disponible.",
    roles: ["admin", "caja"],
    schema: {
      persona: z.string().trim().min(1).max(160),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const persona = await resolverPersona(admin, String(args.persona))
      const datos = {
        asistenteId: persona.id,
        fecha: String(args.fecha || fechaHoyBogota()),
        notas: args.notas ? String(args.notas) : null,
      }
      const previa = await previsualizarSesionCoach(admin, datos as any)

      return {
        datos,
        resumen: `Registrar sesion coach de ${persona.nombre} el ${previa.fecha}`,
        detalle: {
          persona: persona.nombre,
          fecha: previa.fecha,
          sesiones_compradas: previa.compradas,
          sesiones_realizadas: previa.realizadas,
          restantes_antes: previa.restantesAntes,
          restantes_despues: previa.restantesDespues,
        },
        avisos: [
          previa.restantesDespues === 0 ? "Con esta sesion se agota el paquete de la persona." : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await registrarSesionCoach(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { fecha: r.fecha, sesiones_restantes: r.restantesDespues }
    },
  },
  {
    nombre: "persona",
    titulo: "Registrar una persona nueva",
    descripcion:
      "Da de alta a una persona (asistente) en el ERP. Necesario antes de poder cobrarle o registrarle pagos.",
    roles: ["admin", "caja"],
    riesgo: "crear",
    schema: {
      nombre: z.string().trim().min(3).max(160),
      cedula: z.string().trim().max(40).optional(),
      correo: z.string().trim().email().max(160).optional(),
      telefono: z.string().trim().max(40).optional(),
      codigo: z.string().trim().max(40).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const nombre = String(args.nombre).trim()
      const datos = {
        nombre,
        cedula: args.cedula ? String(args.cedula).trim() : null,
        correo: args.correo ? String(args.correo).trim() : null,
        telefono: args.telefono ? String(args.telefono).trim() : null,
        codigo: args.codigo ? String(args.codigo).trim() : null,
      }

      // Aviso de posible homonimo o alta repetida.
      const { data: parecidos } = await admin
        .from("asistentes")
        .select("nombre, codigo")
        .ilike("nombre", `%${nombre}%`)
        .limit(5)

      return {
        datos,
        resumen: `Registrar a ${nombre} como persona nueva`,
        detalle: datos,
        avisos: [
          parecidos && parecidos.length
            ? `Ya hay personas con nombre parecido: ${parecidos
                .map((p: any) => `${p.nombre} (${p.codigo})`)
                .join(", ")}. Verifica que no sea la misma.`
            : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearPersona(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { asistente_id: r.id, nombre: r.nombre, codigo: r.codigo }
    },
  },

  {
    nombre: "editar_persona",
    titulo: "Editar los datos de una persona",
    descripcion: "Corrige nombre, cedula, correo, telefono o codigo de una persona ya registrada.",
    roles: ["admin", "caja"],
    riesgo: "editar",
    schema: {
      persona: z.string().trim().min(1).max(160).describe("Persona a editar (nombre o codigo actual)"),
      nombre: z.string().trim().min(3).max(160),
      cedula: z.string().trim().max(40).optional(),
      correo: z.string().trim().email().max(160).optional(),
      telefono: z.string().trim().max(40).optional(),
      codigo: z.string().trim().max(40).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const actual = await resolverPersona(admin, String(args.persona))
      const datos = {
        asistenteId: actual.id,
        nombre: String(args.nombre).trim(),
        cedula: args.cedula ? String(args.cedula).trim() : null,
        correo: args.correo ? String(args.correo).trim() : null,
        telefono: args.telefono ? String(args.telefono).trim() : null,
        codigo: args.codigo ? String(args.codigo).trim() : null,
      }
      return {
        datos,
        resumen: `Actualizar los datos de ${actual.nombre}`,
        detalle: {
          antes: { nombre: actual.nombre, codigo: actual.codigo, cedula: actual.cedula ?? null },
          despues: { nombre: datos.nombre, codigo: datos.codigo, cedula: datos.cedula },
        },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const { asistenteId, ...datos } = d as any
      const r = await editarPersona(admin, { userId: actor.userId, role: actor.role }, asistenteId, datos)
      return { asistente_id: r.id, nombre: r.nombre }
    },
  },

  {
    nombre: "anular_movimiento",
    titulo: "Anular un movimiento",
    descripcion:
      "Marca como ANULADO un pago, egreso, donacion o venta externa mal registrado. No lo borra: queda el rastro. " +
      "Es la forma correcta de corregir un error. Los pagos hechos con saldo a favor y los que generaron sobrepago " +
      "no se pueden anular por aqui.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      tipo: z.enum(TIPOS_ANULABLES),
      movimiento_id: z.string().uuid().describe("Id del movimiento a anular"),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = { tipo: String(args.tipo), movimientoId: String(args.movimiento_id) }
      const previa = await previsualizarAnulacion(admin, datos as any)
      return {
        datos,
        resumen: `ANULAR: ${previa.descripcion} por ${money(previa.monto)} del ${previa.fecha}`,
        detalle: {
          tipo: previa.tipo,
          descripcion: previa.descripcion,
          monto: previa.monto,
          fecha: previa.fecha,
          efecto: previa.efecto,
        },
        avisos: [
          "Esta operacion cambia cifras ya registradas. Confirma con el usuario que es el movimiento correcto.",
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await anularMovimiento(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { anulado: r.tipo, movimiento_id: r.movimientoId, monto_anulado: r.montoAnulado }
    },
  },
  {
    nombre: "eliminar_movimiento",
    titulo: "Eliminar un movimiento (borrado definitivo)",
    descripcion:
      "BORRA por completo un pago, egreso, donacion o venta externa. No queda rastro del registro. Usala solo para " +
      "deshacer algo creado por error hace un momento; para corregir historia lo correcto es anular_movimiento.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      tipo: z.enum(TIPOS_ANULABLES),
      movimiento_id: z.string().uuid(),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = { tipo: String(args.tipo), movimientoId: String(args.movimiento_id) }
      const previa = await previsualizarEliminacion(admin, datos as any)
      return {
        datos,
        resumen: `ELIMINAR DEFINITIVAMENTE: ${previa.descripcion} por ${money(previa.monto)} del ${previa.fecha}`,
        detalle: {
          tipo: previa.tipo,
          descripcion: previa.descripcion,
          monto: previa.monto,
          fecha: previa.fecha,
          efecto: previa.efecto,
        },
        avisos: [
          "El borrado es IRREVERSIBLE y no deja rastro del registro. Si solo quieres corregir un error del pasado, " +
            "es mejor anular_movimiento, que conserva el historial.",
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await eliminarMovimiento(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { eliminado: r.tipo, movimiento_id: r.movimientoId, monto_eliminado: r.montoEliminado }
    },
  },

  {
    nombre: "editar_movimiento",
    titulo: "Corregir un egreso, donacion o venta externa",
    descripcion:
      "Cambia el monto, la fecha, el concepto o las notas de un egreso, donacion o venta externa ya registrado. " +
      "El monto de un abono NO se corrige por aqui (debe hacerse en el detalle de la cuenta para no romper el saldo a favor).",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      tipo: z.enum(TIPOS_EDITABLES),
      movimiento_id: z.string().uuid(),
      monto: z.coerce.number().positive().max(100_000_000).optional(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      concepto: z.string().trim().min(2).max(200).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos: Record<string, unknown> = { tipo: String(args.tipo), movimientoId: String(args.movimiento_id) }
      if (args.monto !== undefined) datos.monto = Number(args.monto)
      if (args.fecha !== undefined) datos.fecha = String(args.fecha)
      if (args.concepto !== undefined) datos.concepto = String(args.concepto)
      if (args.notas !== undefined) datos.notas = String(args.notas)

      const previa = await previsualizarEdicion(admin, datos as any)
      const cambios = Object.entries(previa.cambios)
        .map(([campo, v]: any) => `${campo}: ${v.antes} -> ${v.despues}`)
        .join(", ")

      return {
        datos,
        resumen: `CORREGIR ${previa.descripcion} (${cambios})`,
        detalle: { tipo: previa.tipo, descripcion: previa.descripcion, cambios: previa.cambios },
        avisos: ["Cambia cifras ya registradas: verifica que los valores nuevos sean los correctos."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await editarMovimiento(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { editado: r.tipo, movimiento_id: r.movimientoId, cambios: r.cambios }
    },
  },
  {
    nombre: "editar_valor_cuenta",
    titulo: "Corregir el valor de una cuenta",
    descripcion:
      "Cambia cuanto se le cobra a una persona por un concepto. Recalcula el estado de la cuenta. " +
      "No se puede dejar en 0 si ya tiene abonos activos.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      cuenta_id: z.string().uuid(),
      valor_nuevo: z.coerce.number().min(0).max(100_000_000),
      motivo: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = {
        cuentaId: String(args.cuenta_id),
        valorNuevo: Number(args.valor_nuevo),
        motivo: args.motivo ? String(args.motivo) : null,
      }
      const previa = await previsualizarEdicionValorCuenta(admin, datos as any)
      return {
        datos,
        resumen:
          `CORREGIR el valor de "${previa.concepto}" de ${previa.personaNombre}: ` +
          `${money(previa.valorAntes)} -> ${money(previa.valorDespues)}`,
        detalle: {
          persona: previa.personaNombre,
          concepto: previa.concepto,
          valor_antes: previa.valorAntes,
          valor_despues: previa.valorDespues,
          estado_antes: previa.estadoAntes,
          estado_despues: previa.estadoDespues,
        },
        avisos: ["Cambia lo que la persona debe. Verifica el valor nuevo con el usuario."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await editarValorCuenta(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { cuenta_id: r.cuentaId, valor_antes: r.valorAntes, valor_despues: r.valorDespues, estado: r.estadoDespues }
    },
  },

  {
    nombre: "eliminar_cuenta",
    titulo: "Eliminar una cuenta por cobrar",
    descripcion:
      "Borra una cuenta creada por error. Solo procede si no tiene pagos validos, ni saldo a favor aplicado, " +
      "ni sesiones coach ya dictadas.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: { cuenta_id: z.string().uuid() },
    previsualizar: async (admin, _actor, args) => {
      const datos = { cuentaId: String(args.cuenta_id) }
      const previa = await previsualizarEliminacionCuenta(admin, datos.cuentaId)
      return {
        datos,
        resumen: `ELIMINAR la cuenta "${previa.concepto}" de ${previa.personaNombre} por ${money(previa.valorTotal)}`,
        detalle: {
          persona: previa.personaNombre,
          concepto: previa.concepto,
          valor_total: previa.valorTotal,
          fecha_emision: previa.fechaEmision,
          efecto: previa.efecto,
        },
        avisos: ["El borrado es IRREVERSIBLE."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await eliminarCuenta(admin, { userId: actor.userId, role: actor.role }, String((d as any).cuentaId))
      return { cuenta_id: r.cuentaId, concepto: r.concepto, valor_total: r.valorTotal }
    },
  },

  {
    nombre: "estado_persona_activa",
    titulo: "Activar o desactivar una persona",
    descripcion:
      "Marca a una persona como activa o inactiva. No borra nada: es la forma recomendada de retirar a alguien " +
      "que ya no participa, conservando su historial.",
    roles: ["admin"],
    riesgo: "editar",
    schema: {
      persona: z.string().trim().min(1).max(160),
      activo: z.boolean(),
    },
    previsualizar: async (admin, _actor, args) => {
      const persona = await resolverPersona(admin, String(args.persona))
      const activo = Boolean(args.activo)
      const datos = { asistenteId: persona.id, activo }
      return {
        datos,
        resumen: `${activo ? "Activar" : "Desactivar"} a ${persona.nombre}`,
        detalle: { persona: persona.nombre, codigo: persona.codigo, quedara: activo ? "activa" : "inactiva" },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await cambiarEstadoPersona(
        admin,
        { userId: actor.userId, role: actor.role },
        String((d as any).asistenteId),
        Boolean((d as any).activo)
      )
      return { asistente_id: r.id, activo: r.activo }
    },
  },

  {
    nombre: "eliminar_persona",
    titulo: "Eliminar una persona",
    descripcion:
      "Borra a una persona del ERP. Solo procede si NO tiene cuentas registradas. Si ya participo alguna vez, " +
      "lo correcto es desactivarla para conservar su historial.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: { persona: z.string().trim().min(1).max(160) },
    previsualizar: async (admin, _actor, args) => {
      const persona = await resolverPersona(admin, String(args.persona))
      const previa = await previsualizarEliminacionPersona(admin, persona.id)
      return {
        datos: { asistenteId: persona.id },
        resumen: `ELIMINAR a ${previa.nombre} del ERP`,
        detalle: { persona: previa.nombre, codigo: previa.codigo },
        avisos: ["El borrado es IRREVERSIBLE. Si tiene historial, es mejor desactivarla."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await eliminarPersona(admin, { userId: actor.userId, role: actor.role }, String((d as any).asistenteId))
      return { asistente_id: r.asistenteId, nombre: r.nombre }
    },
  },

  {
    nombre: "editar_sesion_coach",
    titulo: "Corregir una sesion coach",
    descripcion: "Cambia la fecha o las notas de una sesion coach ya registrada.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      sesion_id: z.string().uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos: Record<string, unknown> = { sesionId: String(args.sesion_id) }
      if (args.fecha !== undefined) datos.fecha = String(args.fecha)
      if (args.notas !== undefined) datos.notas = String(args.notas)
      const previa = await previsualizarEdicionSesion(admin, datos as any)
      return {
        datos,
        resumen: `CORREGIR la sesion coach de ${previa.personaNombre} del ${previa.fechaActual}`,
        detalle: { persona: previa.personaNombre, cambios: previa.cambios },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await editarSesionCoach(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { sesion_id: r.sesionId, cambios: r.cambios }
    },
  },

  {
    nombre: "eliminar_sesion_coach",
    titulo: "Eliminar una sesion coach",
    descripcion:
      "Borra una sesion coach registrada por error. La sesion vuelve a quedar disponible en el paquete de la persona.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: { sesion_id: z.string().uuid() },
    previsualizar: async (admin, _actor, args) => {
      const datos = { sesionId: String(args.sesion_id) }
      const previa = await previsualizarEliminacionSesion(admin, datos.sesionId)
      return {
        datos,
        resumen: `ELIMINAR la sesion coach de ${previa.personaNombre} del ${previa.fecha}`,
        detalle: { persona: previa.personaNombre, fecha: previa.fecha, efecto: previa.efecto },
        avisos: ["El borrado es IRREVERSIBLE."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await eliminarSesionCoach(admin, { userId: actor.userId, role: actor.role }, String((d as any).sesionId))
      return { sesion_id: r.sesionId, persona: r.personaNombre, fecha: r.fecha }
    },
  },

  {
    nombre: "revertir_abono",
    titulo: "Revertir un abono con sobrepago",
    descripcion:
      "Anula un abono que genero saldo a favor por sobrepago, revirtiendo tambien ese saldo en una sola operacion " +
      "atomica. Es el flujo correcto cuando anular_movimiento se niega por sobrepago.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      cuenta_id: z.string().uuid(),
      abono_id: z.string().uuid(),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = { cuentaId: String(args.cuenta_id), abonoId: String(args.abono_id) }
      const previa = await previsualizarReversoAbono(admin, datos as any)
      return {
        datos,
        resumen:
          `REVERTIR el abono de ${money(previa.monto)} de ${previa.personaNombre} ` +
          `en "${previa.concepto}" (${previa.fecha})`,
        detalle: {
          persona: previa.personaNombre,
          concepto: previa.concepto,
          monto: previa.monto,
          fecha: previa.fecha,
          efecto: previa.efecto,
        },
        avisos: ["Revierte el pago Y el saldo a favor que genero. La deuda vuelve a subir."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await revertirAbonoConSaldo(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { abono_id: r.abonoId, monto_revertido: r.montoRevertido }
    },
  },

  {
    nombre: "revertir_anticipo",
    titulo: "Revertir un anticipo",
    descripcion:
      "Anula un anticipo (saldo a favor que la persona habia entregado) y lo descuenta de su saldo disponible. " +
      "Solo procede si ese saldo no se ha consumido ya.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      persona: z.string().trim().min(1).max(160),
      anticipo_id: z.string().uuid(),
    },
    previsualizar: async (admin, _actor, args) => {
      const persona = await resolverPersona(admin, String(args.persona))
      const datos = { asistenteId: persona.id, anticipoId: String(args.anticipo_id) }
      const previa = await previsualizarReversoAnticipo(admin, datos as any)
      return {
        datos,
        resumen: `REVERTIR el anticipo de ${money(previa.monto)} de ${persona.nombre} (${previa.fecha})`,
        detalle: {
          persona: persona.nombre,
          monto_original: previa.monto,
          monto_que_se_revierte: previa.montoNormalizado,
          saldo_disponible_antes: previa.disponible,
          saldo_disponible_despues: previa.saldoDespues,
          efecto: previa.efecto,
        },
        avisos: [
          previa.montoNormalizado !== previa.monto
            ? `El reverso se hace por ${money(previa.montoNormalizado)} (multiplo de 50), no por ${money(previa.monto)}.`
            : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await revertirAnticipo(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { anticipo_id: r.anticipoId, monto_revertido: r.montoRevertido, saldo_despues: r.saldoDespues }
    },
  },

  {
    nombre: "socio",
    titulo: "Registrar un socio",
    descripcion: "Da de alta un socio con su porcentaje de participacion en las liquidaciones.",
    roles: ["admin"],
    riesgo: "crear",
    schema: {
      nombre: z.string().trim().min(3).max(160),
      porcentaje: z.coerce.number().min(0).max(100),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = { nombre: String(args.nombre).trim(), porcentaje: Number(args.porcentaje) }
      const totalActual = await porcentajeTotalSocios(admin)
      const total = totalActual + datos.porcentaje
      return {
        datos,
        resumen: `Registrar al socio ${datos.nombre} con ${datos.porcentaje}% de participacion`,
        detalle: {
          nombre: datos.nombre,
          porcentaje: datos.porcentaje,
          porcentaje_actual_de_socios_activos: totalActual,
          porcentaje_total_quedaria: total,
        },
        avisos: [total > 100 ? `OJO: la suma de participaciones quedaria en ${total}%, por encima de 100%.` : null],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearSocio(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { socio_id: r.id, nombre: r.nombre, porcentaje: r.porcentaje }
    },
  },

  {
    nombre: "editar_socio",
    titulo: "Editar un socio",
    descripcion: "Cambia el nombre o el porcentaje de participacion de un socio.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      socio: z.string().trim().min(2).max(160).describe("Nombre actual del socio"),
      nombre: z.string().trim().min(3).max(160),
      porcentaje: z.coerce.number().min(0).max(100),
    },
    previsualizar: async (admin, _actor, args) => {
      const socio = await buscarSocio(admin, String(args.socio))
      const datos = { socioId: socio.id, nombre: String(args.nombre).trim(), porcentaje: Number(args.porcentaje) }
      const totalOtros = await porcentajeTotalSocios(admin, socio.id)
      const total = totalOtros + datos.porcentaje
      return {
        datos,
        resumen: `Editar al socio ${socio.nombre}: ${socio.porcentaje_participacion}% -> ${datos.porcentaje}%`,
        detalle: {
          antes: { nombre: socio.nombre, porcentaje: socio.porcentaje_participacion },
          despues: { nombre: datos.nombre, porcentaje: datos.porcentaje },
          porcentaje_total_quedaria: total,
        },
        avisos: [
          total > 100 ? `OJO: la suma de participaciones quedaria en ${total}%, por encima de 100%.` : null,
          "Cambia como se reparte el dinero en las proximas liquidaciones.",
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const { socioId, ...datos } = d as any
      const r = await editarSocio(admin, { userId: actor.userId, role: actor.role }, socioId, datos)
      return { socio_id: r.id, nombre: r.nombre, porcentaje: r.porcentaje }
    },
  },

  {
    nombre: "estado_socio_activo",
    titulo: "Activar o desactivar un socio",
    descripcion:
      "Marca un socio como activo o inactivo. Un socio inactivo deja de recibir reparto en las liquidaciones.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      socio: z.string().trim().min(2).max(160),
      activo: z.boolean(),
    },
    previsualizar: async (admin, _actor, args) => {
      const socio = await buscarSocio(admin, String(args.socio))
      const activo = Boolean(args.activo)
      return {
        datos: { socioId: socio.id, activo },
        resumen: `${activo ? "Activar" : "Desactivar"} al socio ${socio.nombre}`,
        detalle: { socio: socio.nombre, porcentaje: socio.porcentaje_participacion, quedara: activo ? "activo" : "inactivo" },
        avisos: [!activo ? "Un socio inactivo NO recibe reparto al cerrar la liquidacion." : null],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await cambiarEstadoSocio(
        admin,
        { userId: actor.userId, role: actor.role },
        String((d as any).socioId),
        Boolean((d as any).activo)
      )
      return { socio_id: r.id, activo: r.activo }
    },
  },

  {
    nombre: "periodo",
    titulo: "Abrir un periodo contable",
    descripcion:
      "Crea un periodo (quincena) nuevo. Solo puede haber UN periodo abierto a la vez y no puede solaparse con otro.",
    roles: ["admin"],
    riesgo: "crear",
    schema: {
      nombre: z.string().trim().min(3).max(120),
      fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = {
        nombre: String(args.nombre).trim(),
        fechaInicio: String(args.fecha_inicio),
        fechaFin: String(args.fecha_fin),
      }
      await validarPeriodoNuevo(admin, datos as any)
      return {
        datos,
        resumen: `Abrir el periodo "${datos.nombre}" del ${datos.fechaInicio} al ${datos.fechaFin}`,
        detalle: { nombre: datos.nombre, desde: datos.fechaInicio, hasta: datos.fechaFin, estado: "abierto" },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearPeriodo(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { periodo_id: r.id, nombre: r.nombre, desde: r.fechaInicio, hasta: r.fechaFin }
    },
  },

  {
    nombre: "fecha_fin_periodo",
    titulo: "Mover la fecha de fin de un periodo",
    descripcion:
      "Alarga o acorta el periodo abierto. No puede solaparse con otro periodo ni dejar adelantos fuera del rango.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      periodo_id: z.string().uuid(),
      nueva_fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = { periodoId: String(args.periodo_id), nuevaFechaFin: String(args.nueva_fecha_fin) }
      const v = await validarCambioFechaFin(admin, datos.periodoId, datos.nuevaFechaFin)
      return {
        datos,
        resumen: `Mover el fin de "${v.periodo.nombre}": ${v.periodo.fecha_fin} -> ${v.fin}`,
        detalle: { periodo: v.periodo.nombre, desde: v.periodo.fecha_inicio, fin_antes: v.periodo.fecha_fin, fin_despues: v.fin },
        avisos: ["Cambia que movimientos entran en la liquidacion de este periodo."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await cambiarFechaFinPeriodo(
        admin,
        { userId: actor.userId, role: actor.role },
        String((d as any).periodoId),
        String((d as any).nuevaFechaFin)
      )
      return { periodo_id: r.periodoId, nombre: r.nombre, fin_antes: r.fechaFinAntes, fin_despues: r.fechaFinDespues }
    },
  },

  {
    nombre: "adelanto_socio",
    titulo: "Registrar un adelanto a un socio",
    descripcion:
      "Registra dinero entregado a un socio a cuenta de su liquidacion. La fecha debe caer dentro del periodo abierto.",
    roles: ["admin"],
    riesgo: "crear",
    schema: {
      periodo_id: z.string().uuid(),
      socio: z.string().trim().min(2).max(160),
      monto: z.coerce.number().positive().max(100_000_000),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      metodo_pago: z.enum(METODOS_PAGO).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      exigirMontoPositivo(args.monto)
      const socio = await buscarSocio(admin, String(args.socio))
      const datos = {
        periodoId: String(args.periodo_id),
        socioId: socio.id,
        monto: Number(args.monto),
        fecha: String(args.fecha),
        metodoPago: args.metodo_pago ? String(args.metodo_pago) : "otro",
        notas: args.notas ? String(args.notas) : null,
      }
      const v = await validarAdelanto(admin, datos as any)
      return {
        datos,
        resumen: `Registrar adelanto de ${money(v.monto)} al socio ${socio.nombre} (${v.fecha})`,
        detalle: {
          socio: socio.nombre,
          monto: v.monto,
          fecha: v.fecha,
          periodo: v.periodo.nombre,
          metodo_pago: datos.metodoPago,
        },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearAdelanto(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { adelanto_id: r.id, monto: r.monto, fecha: r.fecha, periodo: r.periodo }
    },
  },

  {
    nombre: "cerrar_liquidacion",
    titulo: "Cerrar la liquidacion de un periodo",
    descripcion:
      "Congela los resultados del periodo (reparto por socio y totales por metodo de pago) y lo marca como CERRADO. " +
      "Desde ese momento ninguna fecha dentro del periodo admite cambios y la aplicacion NO permite reabrirlo. " +
      "Es la operacion mas delicada del sistema.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: { periodo_id: z.string().uuid() },
    previsualizar: async (admin, _actor, args) => {
      const datos = { periodoId: String(args.periodo_id) }
      const periodo = await validarCierreLiquidacion(admin, datos.periodoId)
      return {
        datos,
        resumen: `CERRAR la liquidacion del periodo "${periodo.nombre}" (${periodo.fecha_inicio} a ${periodo.fecha_fin})`,
        detalle: {
          periodo: periodo.nombre,
          desde: periodo.fecha_inicio,
          hasta: periodo.fecha_fin,
          efecto:
            "Se congela el reparto por socio y los totales por metodo de pago; el periodo queda CERRADO.",
        },
        avisos: [
          "IRREVERSIBLE desde la aplicacion: despues de cerrar no se puede registrar ni corregir NADA con fecha " +
            "dentro de este periodo, y no hay opcion de reabrirlo. Asegurate de que todo este registrado antes.",
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await cerrarLiquidacion(admin, { userId: actor.userId, role: actor.role }, String((d as any).periodoId))
      return { periodo_id: r.periodoId, nombre: r.nombre, desde: r.fechaInicio, hasta: r.fechaFin }
    },
  },

  {
    nombre: "corregir_monto_pago",
    titulo: "Corregir el monto de un pago",
    descripcion:
      "Cambia el monto de un pago ya registrado. Internamente hace lo contablemente correcto: anula el pago actual " +
      "(y el saldo a favor que hubiera generado) y registra uno nuevo con el monto correcto, en la misma fecha y " +
      "con el mismo metodo. Queda el rastro de ambos.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      cuenta_id: z.string().uuid(),
      abono_id: z.string().uuid(),
      monto_nuevo: z.coerce.number().positive().max(100_000_000),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = {
        cuentaId: String(args.cuenta_id),
        abonoId: String(args.abono_id),
        montoNuevo: Number(args.monto_nuevo),
      }
      const previa = await previsualizarCorreccionMonto(admin, datos as any)
      return {
        datos,
        resumen:
          `CORREGIR el pago de ${previa.personaNombre} en "${previa.concepto}": ` +
          `${money(previa.montoAntes)} -> ${money(previa.montoDespues)}`,
        detalle: {
          persona: previa.personaNombre,
          concepto: previa.concepto,
          fecha: previa.fecha,
          monto_antes: previa.montoAntes,
          monto_despues: previa.montoDespues,
          como_se_hace: previa.efecto,
        },
        avisos: ["Se anula el pago original y se crea uno nuevo: en el historial apareceran los dos."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await corregirMontoPago(admin, { userId: actor.userId, role: actor.role }, d as any)
      return {
        pago_anulado: r.abonoAnulado,
        pago_nuevo: r.pagoNuevoId,
        monto_antes: r.montoAntes,
        monto_despues: r.montoDespues,
        excedente_a_saldo_a_favor: r.excedenteASaldoFavor,
        estado_de_la_cuenta: r.estadoDeLaCuenta,
      }
    },
  },

  {
    nombre: "pagar_deudas_con_saldo",
    titulo: "Aplicar el saldo a favor a todas las deudas",
    descripcion:
      "Usa el saldo a favor disponible de una persona para ir pagando sus cuentas pendientes, de la mas antigua a " +
      "la mas nueva. Cada aplicacion se ajusta a multiplos de 50 pesos.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: { persona: z.string().trim().min(1).max(160) },
    previsualizar: async (admin, _actor, args) => {
      const persona = await resolverPersona(admin, String(args.persona))
      const previa = await previsualizarPagarDeudasConSaldo(admin, persona.id)
      return {
        datos: { asistenteId: persona.id },
        resumen:
          `Aplicar ${money(previa.totalAplicado)} del saldo a favor de ${persona.nombre} ` +
          `a ${previa.plan.length} cuenta(s)`,
        detalle: {
          persona: persona.nombre,
          saldo_disponible: previa.disponible,
          se_aplicara: previa.plan.map((p: any) => ({
            concepto: p.concepto,
            pendiente: p.pendiente,
            se_aplica: p.seAplica,
          })),
          total_aplicado: previa.totalAplicado,
          saldo_despues: previa.saldoDespues,
        },
        avisos: [
          previa.saldoDespues > 0
            ? `Quedaran ${money(previa.saldoDespues)} de saldo a favor sin aplicar.`
            : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await pagarDeudasConSaldo(
        admin,
        { userId: actor.userId, role: actor.role },
        String((d as any).asistenteId)
      )
      return {
        cuentas_pagadas: r.aplicadas.length,
        total_aplicado: r.totalAplicado,
        detalle: r.aplicadas,
        parcial: r.parcial,
        motivo: r.motivo,
      }
    },
  },

]

const POR_NOMBRE = new Map(OPERACIONES.map((o) => [o.nombre, o]))

// ---------------------------------------------------------------- registro

function registrarHerramienta(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  inputSchema: Record<string, z.ZodTypeAny>,
  anotaciones: typeof ANOTACIONES_BORRADOR | typeof ANOTACIONES_ESCRITURA,
  run: (admin: any, actor: Actor, args: any) => Promise<unknown>
) {
  const descriptor = {
    title,
    description,
    inputSchema,
    annotations: anotaciones,
    securitySchemes: SECURITY_SCHEMES,
    _meta: { securitySchemes: SECURITY_SCHEMES },
  }
  server.registerTool(name, descriptor, async (args: any, extra: any) =>
    executeTool(name, args, extra, async () => {
      const admin = createAdminClient()
      if (!admin) throw new Error("Supabase service role no configurado")
      return run(admin, actorDe(extra), args)
    })
  )
}

export function registerEscrituraTools(server: McpServer) {
  for (const op of OPERACIONES) {
    registrarHerramienta(
      server,
      `preparar_${op.nombre}`,
      op.titulo,
      `Paso 1 de 2 — NO escribe nada. ${op.descripcion} Devuelve un resumen de lo que quedaria registrado y un ` +
        `confirmacion_id. Muestrale SIEMPRE el resumen al usuario y espera su aprobacion explicita antes de llamar a confirmar_operacion.`,
      op.schema,
      ANOTACIONES_BORRADOR,
      async (admin, actor, args) => {
        exigirRol(actor, op.roles)
        const preparado = await op.previsualizar(admin, actor, args)

        const huella = huellaOperacion(actor.userId, op.nombre as any, preparado.datos)
        const duplicado = await buscarEjecucionReciente(admin, actor.userId, huella)

        const borrador = await crearBorrador(admin, {
          userId: actor.userId,
          operacion: op.nombre as any,
          resumen: preparado.resumen,
          datos: preparado.datos,
        })

        const avisos = (preparado.avisos || []).filter(Boolean)
        if (duplicado) {
          avisos.push(
            `OJO: ya registraste una operacion identica el ${duplicado.creadoEn}. Confirma con el usuario que no sea un duplicado.`
          )
        }

        const destructiva = op.riesgo === "destructiva"

        return {
          status: "borrador",
          confirmacion_id: borrador.id,
          caduca_en_minutos: TTL_BORRADOR_MINUTOS,
          requiere_confirmacion_reforzada: destructiva || undefined,
          instruccion_para_el_asistente: destructiva
            ? "OPERACION DELICADA: cambia cifras ya registradas. Muestra el resumen, explica el efecto y pide una " +
              "aprobacion INEQUIVOCA (que el usuario diga claramente que si a ESTA operacion concreta). Solo entonces " +
              "llama a confirmar_operacion pasando ademas confirmacion_reforzada: \"CONFIRMO\". Si el usuario duda, " +
              "corrige algo o no responde con claridad, usa cancelar_operacion."
            : "Muestra este resumen al usuario y pide su aprobacion explicita. Solo si responde que si, llama a " +
              "confirmar_operacion con confirmacion_id. No inventes datos que no esten aqui.",
          resumen: preparado.resumen,
          detalle: preparado.detalle,
          avisos: avisos.length ? avisos : null,
        }
      }
    )
  }

  registrarHerramienta(
    server,
    "confirmar_operacion",
    "Confirmar una operacion preparada",
    "Paso 2 de 2. ESCRIBE en la contabilidad la operacion preparada. Llamala UNICAMENTE despues de que el usuario " +
      "haya aprobado explicitamente el resumen. Cada confirmacion sirve una sola vez.",
    {
      confirmacion_id: z.string().uuid().describe("El id devuelto por una herramienta preparar_*"),
      confirmacion_reforzada: z
        .literal("CONFIRMO")
        .optional()
        .describe("Obligatorio en operaciones delicadas (anular, eliminar, revertir)."),
    },
    ANOTACIONES_ESCRITURA,
    async (admin, actor, args) => {
      const borrador = await reclamarBorrador(admin, {
        id: String(args.confirmacion_id),
        userId: actor.userId,
      })

      const op = POR_NOMBRE.get(borrador.operacion)
      if (!op) {
        await marcarFallido(admin, borrador.id, "operacion desconocida")
        throw new OperacionMcpError(`Operacion no soportada: ${borrador.operacion}`)
      }

      // Segundo cerrojo para lo que cambia cifras ya registradas.
      if (op.riesgo === "destructiva" && args.confirmacion_reforzada !== "CONFIRMO") {
        await marcarFallido(admin, borrador.id, "falto la confirmacion reforzada")
        throw new OperacionMcpError(
          "Esta operacion es delicada y necesita confirmacion reforzada. Verifica con el usuario que quiere " +
            'hacerla y vuelve a prepararla, confirmando con confirmacion_reforzada: "CONFIRMO".'
        )
      }

      try {
        exigirRol(actor, op.roles)
        const resultado = await op.ejecutar(admin, actor, borrador.params)
        await marcarEjecutado(admin, borrador.id, resultado)
        return {
          status: "ejecutado",
          operacion: borrador.operacion,
          resumen: borrador.resumen,
          registrado: resultado,
        }
      } catch (error: any) {
        const mensaje =
          error instanceof OperacionError || error instanceof OperacionMcpError
            ? error.message
            : "No se pudo ejecutar la operacion."
        await marcarFallido(admin, borrador.id, mensaje)
        throw new OperacionMcpError(`${mensaje} No se registro nada; vuelve a prepararlo si quieres reintentar.`)
      }
    }
  )

  registrarHerramienta(
    server,
    "cancelar_operacion",
    "Cancelar una operacion preparada",
    "Descarta un borrador que el usuario no aprobo, para que no pueda confirmarse despues por error.",
    { confirmacion_id: z.string().uuid() },
    ANOTACIONES_BORRADOR,
    async (admin, actor, args) => {
      const ok = await cancelarBorrador(admin, { id: String(args.confirmacion_id), userId: actor.userId })
      return {
        status: ok ? "cancelado" : "sin_efecto",
        message: ok
          ? "Borrador cancelado; ya no puede confirmarse."
          : "Ese borrador ya no estaba pendiente (puede que ya se ejecutara o caducara).",
      }
    }
  )
}
