import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { createAdminClient } from "@/lib/supabase/admin"
import type { DbClient } from "@/lib/supabase/types"
import { OperacionError, OperacionParcialError } from "@/lib/operaciones/errores"
import { executeTool } from "./erp-tools"
import {
  OperacionMcpError,
  type OperacionEscritura,
  TTL_BORRADOR_MINUTOS,
  buscarEjecucionReciente,
  cancelarBorrador,
  crearBorrador,
  huellaOperacion,
  marcarEjecutado,
  marcarFallido,
  reclamarBorrador,
} from "./operaciones"
import {
  SECURITY_SCHEMES,
  ANOTACIONES_BORRADOR,
  ANOTACIONES_ESCRITURA,
  actorDe,
  exigirRol,
  type Actor,
  type DefinicionOperacion,
  type ExtraMcp,
} from "./escritura/comun"
import { OPERACIONES_DINERO } from "./escritura/dinero"
import { OPERACIONES_COACH } from "./escritura/coach"
import { OPERACIONES_PERSONAS } from "./escritura/personas"
import { OPERACIONES_CORRECCIONES } from "./escritura/correcciones"
import { OPERACIONES_ADMINISTRACION } from "./escritura/administracion"

// Herramientas de ESCRITURA del MCP.
//
// Todas siguen el mismo camino: preparar_<algo> calcula y MUESTRA lo que
// pasaria (sin escribir), y confirmar_operacion ejecuta. Definirlas en un
// registro hace que cada operacion nueva herede los mismos candados: rol,
// borrador de un solo uso, caducidad, aviso de duplicado y auditoria.
//
// Las operaciones viven por tema en ./escritura/ (dinero, coach, personas,
// correcciones, administracion); aqui se juntan en el orden en que el MCP las
// ofrece y se registran.

const ORDEN: OperacionEscritura[] = [
  "registrar_pago",
  "cuenta",
  "egreso",
  "venta_externa",
  "donacion",
  "anticipo",
  "aplicar_saldo_favor",
  "sesion_coach",
  "persona",
  "editar_persona",
  "anular_movimiento",
  "eliminar_movimiento",
  "editar_movimiento",
  "editar_valor_cuenta",
  "eliminar_cuenta",
  "estado_persona_activa",
  "eliminar_persona",
  "editar_sesion_coach",
  "eliminar_sesion_coach",
  "revertir_abono",
  "revertir_anticipo",
  "socio",
  "editar_socio",
  "estado_socio_activo",
  "periodo",
  "fecha_fin_periodo",
  "adelanto_socio",
  "devolucion_adelanto",
  "cerrar_liquidacion",
  "corregir_monto_pago",
  "pagar_deudas_con_saldo",
  "configuracion_empresa",
]

const TODAS = new Map<string, DefinicionOperacion>(
  [
    ...OPERACIONES_DINERO,
    ...OPERACIONES_COACH,
    ...OPERACIONES_PERSONAS,
    ...OPERACIONES_CORRECCIONES,
    ...OPERACIONES_ADMINISTRACION,
  ].map((o) => [o.nombre, o])
)

// Exportado para que las pruebas puedan comprobar que los permisos del MCP
// coinciden EXACTAMENTE con los del ERP por navegador.
export const OPERACIONES: DefinicionOperacion[] = ORDEN.map((nombre) => {
  const op = TODAS.get(nombre)
  if (!op) throw new Error(`Falta la operacion de escritura ${nombre}`)
  return op
})

const POR_NOMBRE = new Map<string, DefinicionOperacion>(OPERACIONES.map((o) => [o.nombre, o]))

// ---------------------------------------------------------------- registro

function registrarHerramienta(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  inputSchema: Record<string, z.ZodTypeAny>,
  anotaciones: typeof ANOTACIONES_BORRADOR | typeof ANOTACIONES_ESCRITURA,
  run: (admin: DbClient, actor: Actor, args: Record<string, unknown>) => Promise<unknown>
) {
  const descriptor = {
    title,
    description,
    inputSchema,
    annotations: anotaciones,
    securitySchemes: SECURITY_SCHEMES,
    _meta: { securitySchemes: SECURITY_SCHEMES },
  }
  server.registerTool(name, descriptor, async (args: Record<string, unknown>, extra: ExtraMcp) =>
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

        const huella = huellaOperacion(actor.userId, op.nombre, preparado.datos)
        const duplicado = await buscarEjecucionReciente(admin, actor.userId, huella)

        const borrador = await crearBorrador(admin, {
          userId: actor.userId,
          operacion: op.nombre,
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
      } catch (error) {
        const mensaje =
          error instanceof OperacionError || error instanceof OperacionMcpError
            ? error.message
            : "No se pudo ejecutar la operacion."
        await marcarFallido(admin, borrador.id, mensaje)
        // Si alcanzo a escribir algo, el mensaje ya dice que quedo hecho: no
        // se le puede agregar "no se registro nada".
        if (error instanceof OperacionParcialError) throw new OperacionMcpError(mensaje)
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
