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
import { aplicarSaldoAFavor, previsualizarAplicarSaldo, saldoFavorDisponible } from "@/lib/operaciones/saldo-favor"
import { previsualizarSesionCoach, registrarSesionCoach } from "@/lib/operaciones/coach"
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
      persona: z.string().trim().min(2).max(160).describe("Nombre o codigo de quien paga"),
      monto: z.number().positive().max(100_000_000),
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
      persona: z.string().trim().min(2).max(160),
      concepto: z.string().trim().min(2).max(160),
      valor_total: z.number().positive().max(100_000_000),
      fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      exigirMontoPositivo(args.valor_total, "El valor de la cuenta")
      const persona = await resolverPersona(admin, String(args.persona))
      const datos = {
        asistenteId: persona.id,
        concepto: String(args.concepto).trim(),
        valorTotal: Number(args.valor_total),
        fechaEmision: String(args.fecha_emision || fechaHoyBogota()),
      }
      return {
        datos,
        resumen: `Crear cuenta "${datos.concepto}" por ${money(datos.valorTotal)} a ${persona.nombre}`,
        detalle: {
          persona: persona.nombre,
          codigo: persona.codigo,
          concepto: datos.concepto,
          valor_total: datos.valorTotal,
          fecha_emision: datos.fechaEmision,
          estado_inicial: "pendiente",
        },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearCuenta(admin, { userId: actor.userId, role: actor.role }, d as any)
      return { cuenta_id: r.id, concepto: r.concepto, valor_total: r.valorTotal }
    },
  },

  {
    nombre: "egreso",
    titulo: "Registrar un egreso",
    descripcion: "Registra un gasto de la fundacion (arriendo, insumos, honorarios...).",
    roles: ["admin"],
    schema: {
      concepto: z.string().trim().min(2).max(200),
      monto: z.number().positive().max(100_000_000),
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
      monto: z.number().positive().max(100_000_000),
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
      persona: z.string().trim().min(2).max(160),
      monto: z.number().positive().max(100_000_000),
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
      persona: z.string().trim().min(2).max(160),
      monto: z.number().positive().max(100_000_000),
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
      persona: z.string().trim().min(2).max(160),
      monto: z.number().positive().max(100_000_000),
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
      persona: z.string().trim().min(2).max(160),
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

        return {
          status: "borrador",
          confirmacion_id: borrador.id,
          caduca_en_minutos: TTL_BORRADOR_MINUTOS,
          instruccion_para_el_asistente:
            "Muestra este resumen al usuario y pide su aprobacion explicita. Solo si responde que si, llama a " +
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
    { confirmacion_id: z.string().uuid().describe("El id devuelto por una herramienta preparar_*") },
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
