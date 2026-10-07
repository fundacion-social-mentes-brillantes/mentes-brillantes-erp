import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { z } from "zod"
import type { DbClient } from "@/lib/supabase/types"
import { searchPerson } from "@/lib/telegram-cajero/tools"
import { calcularPendienteCuenta, toSafeNumber } from "@/lib/utils/contable"
import { MCP_PRIMARY_SCOPE } from "../constants"
import { OperacionMcpError, type OperacionEscritura } from "../operaciones"

// Herramientas de ESCRITURA del MCP.
//
// Todas siguen el mismo camino: preparar_<algo> calcula y MUESTRA lo que
// pasaria (sin escribir), y confirmar_operacion ejecuta. Definirlas en un
// registro hace que cada operacion nueva herede los mismos candados: rol,
// borrador de un solo uso, caducidad, aviso de duplicado y auditoria.

export const SECURITY_SCHEMES = [{ type: "oauth2", scopes: [MCP_PRIMARY_SCOPE] }] as const

export const ANOTACIONES_BORRADOR = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const

export const ANOTACIONES_ESCRITURA = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const

export const METODOS_PAGO = ["efectivo", "nequi", "daviplata", "otro"] as const

export type Rol = "admin" | "caja"
export type Actor = { userId: string; role: Rol; email: string }

export type Preparado<D> = {
  resumen: string
  detalle: Record<string, unknown>
  datos: D
  avisos?: Array<string | null>
}

/** Una operacion con sus tipos: `args` sale de `schema` y `datos` de lo que arma la previsualizacion. */
export type Definicion<S extends z.ZodRawShape, D extends Record<string, unknown>> = {
  nombre: OperacionEscritura
  titulo: string
  descripcion: string
  roles: Rol[]
  /** "destructiva" exige confirmacion reforzada al ejecutar. */
  riesgo?: "crear" | "editar" | "destructiva"
  schema: S
  previsualizar: (admin: DbClient, actor: Actor, args: z.infer<z.ZodObject<S>>) => Promise<Preparado<D>>
  ejecutar: (admin: DbClient, actor: Actor, datos: D) => Promise<Record<string, unknown>>
}

/** La misma operacion vista desde el registro, que las maneja todas igual. */
export type DefinicionOperacion = Omit<Definicion<z.ZodRawShape, Record<string, unknown>>, "previsualizar" | "ejecutar"> & {
  previsualizar: (admin: DbClient, actor: Actor, args: Record<string, unknown>) => Promise<Preparado<Record<string, unknown>>>
  ejecutar: (admin: DbClient, actor: Actor, datos: Record<string, unknown>) => Promise<Record<string, unknown>>
}

/**
 * Registra una operacion conservando sus tipos adentro. Los dos cast de aqui
 * son seguros y son los unicos: el servidor MCP ya valido `args` contra
 * `schema` antes de llamar, y `datos` vuelve del borrador que armo la propia
 * previsualizacion de esta operacion.
 */
export function operacion<S extends z.ZodRawShape, D extends Record<string, unknown>>(def: Definicion<S, D>): DefinicionOperacion {
  return {
    ...def,
    previsualizar: (admin, actor, args) => def.previsualizar(admin, actor, args as z.infer<z.ZodObject<S>>),
    ejecutar: (admin, actor, datos) => def.ejecutar(admin, actor, datos as D),
  }
}

/** Los datos de una devolucion: contra un adelanto puntual o repartida en los del socio. */
export type DatosDevolucion = { monto: number; fecha: string; metodoPago: string; notas: string | null } & (
  | { modo: "adelanto"; adelantoId: string }
  | { modo: "socio"; socioId: string }
)

export const money = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`

export const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Para mostrar en un borrador un dato de contacto sin exponerlo entero (el
 * filtro de privacidad del MCP no deja salir cedulas, correos ni telefonos).
 * Alcanza para que la persona reconozca que es el dato correcto.
 */
export function enmascarar(valor: unknown): string {
  const s = String(valor ?? "").trim()
  if (!s) return "(vacio)"
  if (s.includes("@")) {
    const [usuario, dominio] = s.split("@")
    return `${usuario.slice(0, 2)}•••@${dominio}`
  }
  return s.length <= 4 ? "••••" : `••••${s.slice(-4)}`
}

export type ExtraMcp = { authInfo?: AuthInfo }

export function actorDe(extra: ExtraMcp): Actor {
  const info = extra?.authInfo?.extra
  const rol = info?.role === "admin" || info?.role === "caja" ? info.role : undefined
  return {
    userId: String(info?.sub || ""),
    // Un rol desconocido no pasa exigirRol: se deja vacio a proposito.
    role: rol as Rol,
    email: String(info?.email || ""),
  }
}

export function exigirRol(actor: Actor, permitidos: Rol[]) {
  if (!permitidos.includes(actor.role)) {
    throw new OperacionMcpError(
      `Tu rol (${actor.role}) no puede hacer esta operacion. Requiere: ${permitidos.join(" o ")}.`
    )
  }
}

export async function resolverPersona(admin: DbClient, persona: string) {
  const res = await searchPerson(admin, persona, 6)
  if (res.status === "error") throw new OperacionMcpError("No se pudo buscar la persona.")
  const filas = Array.isArray(res.data) ? res.data : []
  if (!filas.length) throw new OperacionMcpError(`No encontre a "${persona}" en el ERP.`)
  if (filas.length > 1) {
    const opciones = filas.map((f) => `${f.nombre} (codigo ${f.codigo})`).join(" | ")
    throw new OperacionMcpError(
      `Hay varias personas que coinciden con "${persona}". Indica el codigo exacto: ${opciones}`
    )
  }
  return filas[0]
}

export async function cuentasPendientesDe(admin: DbClient, asistenteId: string) {
  const { data, error } = await admin
    .from("cuentas_por_cobrar")
    .select("id, concepto, valor_total, estado, fecha_emision, pagos_abonos(id, monto, estado, notas, origen_fondos)")
    .eq("asistente_id", asistenteId)
    .in("estado", ["pendiente", "parcial"])
    .order("fecha_emision", { ascending: true })

  if (error) throw new OperacionMcpError("No se pudieron leer las cuentas de la persona.")
  return (data || []).map((c) => ({
    id: c.id,
    concepto: c.concepto,
    pendiente: calcularPendienteCuenta(toSafeNumber(c.valor_total), c.pagos_abonos),
  }))
}

// ------------------------------------------------------------- operaciones
