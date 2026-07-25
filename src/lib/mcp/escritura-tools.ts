import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { createAdminClient } from "@/lib/supabase/admin"
import { searchPerson } from "@/lib/telegram-cajero/tools"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import { calcularPendienteCuenta, toSafeNumber } from "@/lib/utils/contable"
import { OperacionError, previsualizarAbono, registrarAbono } from "@/lib/operaciones/abonos"
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
// Ninguna escribe directamente: preparar_* deja un borrador con el detalle
// exacto (incluido como queda el saldo despues) y solo confirmar_operacion
// ejecuta. El borrador caduca y sirve una sola vez.

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

type Actor = { userId: string; role: "admin" | "caja"; email: string }

function actorDe(extra: any): Actor {
  const info = extra?.authInfo?.extra
  return { userId: String(info?.sub || ""), role: info?.role, email: String(info?.email || "") }
}

function exigirRol(actor: Actor, permitidos: Array<"admin" | "caja">) {
  if (!permitidos.includes(actor.role)) {
    throw new OperacionMcpError(
      `Tu rol (${actor.role}) no puede hacer esta operacion. Requiere: ${permitidos.join(" o ")}.`
    )
  }
}

const money = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`

function registrar(
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
  server.registerTool(
    name,
    descriptor,
    async (args: any, extra: any) =>
      executeTool(name, args, extra, async () => {
        const admin = createAdminClient()
        if (!admin) throw new Error("Supabase service role no configurado")
        return run(admin, actorDe(extra), args)
      })
  )
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
    valorTotal: toSafeNumber(c.valor_total),
    pendiente: calcularPendienteCuenta(toSafeNumber(c.valor_total), c.pagos_abonos),
    estado: c.estado,
    fechaEmision: c.fecha_emision,
  }))
}

export function registerEscrituraTools(server: McpServer) {
  registrar(
    server,
    "preparar_pago",
    "Preparar el registro de un pago",
    "Paso 1 de 2. Calcula y MUESTRA como quedaria el pago (sin escribir nada) y devuelve un id de confirmacion. " +
      "Usala cuando el usuario reporte un pago o envie la foto de un comprobante. Muestrale SIEMPRE el resumen y " +
      "espera su aprobacion explicita antes de llamar a confirmar_operacion.",
    {
      persona: z.string().trim().min(2).max(160).describe("Nombre o codigo de la persona que paga"),
      monto: z.number().positive().max(100_000_000).describe("Monto pagado en pesos"),
      metodo_pago: z.enum(METODOS_PAGO),
      cuenta_id: z.string().uuid().optional().describe("Id de la cuenta; si se omite se busca por concepto"),
      concepto: z.string().trim().max(160).optional().describe("Concepto de la cuenta a abonar (ej: 'primer paso')"),
      fecha_pago: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Fecha del pago YYYY-MM-DD; por defecto hoy"),
      notas: z.string().trim().max(300).optional(),
    },
    ANOTACIONES_BORRADOR,
    async (admin, actor, args) => {
      exigirRol(actor, ["admin", "caja"])

      const persona = await resolverPersona(admin, String(args.persona))
      const cuentas = await cuentasPendientesDe(admin, persona.id)

      let cuentaId: string | undefined = args.cuenta_id
      if (!cuentaId) {
        if (!cuentas.length) {
          throw new OperacionMcpError(
            `${persona.nombre} no tiene cuentas pendientes. Si el pago es por algo nuevo, primero hay que crear la cuenta.`
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

      const fechaPago = String(args.fecha_pago || fechaHoyBogota())
      const datos = {
        cuentaId,
        monto: Number(args.monto),
        metodoPago: String(args.metodo_pago),
        fechaPago,
        notas: args.notas ? String(args.notas) : null,
      }

      const previa = await previsualizarAbono(admin, datos as any)

      const huella = huellaOperacion(actor.userId, "registrar_pago", datos)
      const duplicado = await buscarEjecucionReciente(admin, actor.userId, huella)

      const resumen =
        `Registrar ${money(previa.montoAplicado + previa.excedenteASaldoFavor)} de ${previa.personaNombre} ` +
        `en "${previa.concepto}" (${datos.metodoPago}, ${fechaPago})`

      const borrador = await crearBorrador(admin, {
        userId: actor.userId,
        operacion: "registrar_pago",
        resumen,
        datos,
      })

      return {
        status: "borrador",
        confirmacion_id: borrador.id,
        caduca_en_minutos: TTL_BORRADOR_MINUTOS,
        instruccion_para_el_asistente:
          "Muestra este resumen al usuario y pide su aprobacion explicita. Solo si responde que si, llama a " +
          "confirmar_operacion con confirmacion_id. No inventes datos que no esten aqui.",
        resumen,
        detalle: {
          persona: previa.personaNombre,
          concepto: previa.concepto,
          cuenta_id: previa.cuentaId,
          metodo_pago: datos.metodoPago,
          fecha_pago: fechaPago,
          valor_de_la_cuenta: previa.valorTotal,
          pendiente_antes: previa.pendienteAntes,
          se_aplica_a_la_cuenta: previa.montoAplicado,
          excedente_a_saldo_a_favor: previa.excedenteASaldoFavor,
          pendiente_despues: previa.pendienteDespues,
          estado_antes: previa.estadoAntes,
          estado_despues: previa.estadoDespues,
        },
        aviso_excedente:
          previa.excedenteASaldoFavor > 0
            ? `El pago supera lo pendiente: ${money(previa.excedenteASaldoFavor)} quedaran como saldo a favor de ${previa.personaNombre}.`
            : null,
        aviso_posible_duplicado: duplicado
          ? `OJO: ya registraste un pago identico el ${duplicado.creadoEn}. Confirma con el usuario que no sea el mismo comprobante.`
          : null,
      }
    }
  )

  registrar(
    server,
    "confirmar_operacion",
    "Confirmar una operacion preparada",
    "Paso 2 de 2. ESCRIBE en la contabilidad la operacion preparada. Llamala UNICAMENTE despues de que el usuario " +
      "haya aprobado explicitamente el resumen del borrador. Cada confirmacion sirve una sola vez.",
    {
      confirmacion_id: z.string().uuid().describe("El id devuelto por la herramienta preparar_*"),
    },
    ANOTACIONES_ESCRITURA,
    async (admin, actor, args) => {
      exigirRol(actor, ["admin", "caja"])

      const borrador = await reclamarBorrador(admin, {
        id: String(args.confirmacion_id),
        userId: actor.userId,
      })

      try {
        if (borrador.operacion === "registrar_pago") {
          const p = borrador.params as any
          const resultado = await registrarAbono(
            admin,
            { userId: actor.userId, role: actor.role },
            {
              cuentaId: String(p.cuentaId),
              monto: Number(p.monto),
              metodoPago: p.metodoPago ?? null,
              fechaPago: String(p.fechaPago),
              notas: p.notas ?? null,
            }
          )

          await marcarEjecutado(admin, borrador.id, resultado as any)

          return {
            status: "ejecutado",
            operacion: borrador.operacion,
            resumen: borrador.resumen,
            registrado: {
              pago_id: resultado.pagoId,
              aplicado_a_la_cuenta: resultado.montoAplicado,
              excedente_a_saldo_a_favor: resultado.excedenteASaldoFavor,
              estado_de_la_cuenta: resultado.estadoDespues,
              saldo_favor_id: resultado.saldoFavorId,
            },
          }
        }

        throw new OperacionMcpError(`Operacion no soportada: ${borrador.operacion}`)
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

  registrar(
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
