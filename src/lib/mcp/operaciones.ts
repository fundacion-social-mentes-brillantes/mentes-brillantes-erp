import { createHash } from "node:crypto"

// Borrador -> confirmacion para las operaciones de ESCRITURA del MCP.
//
// Regla central: el MCP nunca escribe en la contabilidad en un solo paso.
// Primero deja un borrador con el detalle exacto (que se le muestra al
// usuario) y solo al confirmar se ejecuta. El paso a "ejecutando" se hace con
// un UPDATE condicional, asi que un mismo borrador no puede ejecutarse dos
// veces ni aunque el cliente reintente o duplique la confirmacion.

export const TTL_BORRADOR_MINUTOS = 10
const VENTANA_DUPLICADOS_HORAS = 24

export type OperacionEscritura =
  | "registrar_pago"
  | "cuenta"
  | "egreso"
  | "venta_externa"
  | "donacion"
  | "anticipo"
  | "aplicar_saldo_favor"
  | "sesion_coach"
  | "persona"
  | "editar_persona"
  | "anular_movimiento"
  | "eliminar_movimiento"
  | "editar_movimiento"
  | "editar_valor_cuenta"
  | "eliminar_cuenta"
  | "estado_persona_activa"
  | "eliminar_persona"
  | "editar_sesion_coach"
  | "eliminar_sesion_coach"
  | "revertir_abono"
  | "revertir_anticipo"
  | "socio"
  | "editar_socio"
  | "estado_socio_activo"
  | "periodo"
  | "fecha_fin_periodo"
  | "adelanto_socio"
  | "cerrar_liquidacion"
  | "corregir_monto_pago"
  | "pagar_deudas_con_saldo"

export type BorradorOperacion = {
  id: string
  operacion: OperacionEscritura
  resumen: string
  params: Record<string, unknown>
  expiraEn: string
}

export type BorradorReclamado = {
  id: string
  operacion: OperacionEscritura
  params: Record<string, unknown>
  resumen: string
}

/** Mensaje pensado para mostrarselo a la persona (ver OperacionError). */
export class OperacionMcpError extends Error {
  readonly esParaUsuario = true
}

function estable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(estable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${estable(v)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

/** Huella de la operacion: sirve para detectar que se repite la misma. */
export function huellaOperacion(
  userId: string,
  operacion: OperacionEscritura,
  params: Record<string, unknown>
): string {
  return createHash("sha256").update(`${userId}|${operacion}|${estable(params)}`).digest("hex")
}

/**
 * Busca operaciones iguales ya ejecutadas hace poco. No bloquea: se usa para
 * ADVERTIR en el borrador (la misma foto de pago enviada dos veces), porque un
 * duplicado tambien puede ser legitimo (dos abonos iguales el mismo dia).
 */
export async function buscarEjecucionReciente(
  admin: any,
  userId: string,
  huella: string
): Promise<{ id: string; creadoEn: string } | null> {
  const desde = new Date(Date.now() - VENTANA_DUPLICADOS_HORAS * 3600_000).toISOString()
  const { data, error } = await admin
    .from("mcp_operaciones")
    .select("id, creado_en")
    .eq("user_id", userId)
    .eq("huella", huella)
    .eq("estado", "ejecutado")
    .gte("creado_en", desde)
    .order("creado_en", { ascending: false })
    .limit(1)

  if (error || !data?.length) return null
  return { id: data[0].id, creadoEn: data[0].creado_en }
}

export async function crearBorrador(
  admin: any,
  params: {
    userId: string
    operacion: OperacionEscritura
    resumen: string
    datos: Record<string, unknown>
  }
): Promise<BorradorOperacion> {
  const id = crypto.randomUUID()
  const expiraEn = new Date(Date.now() + TTL_BORRADOR_MINUTOS * 60_000).toISOString()

  const { error } = await admin.from("mcp_operaciones").insert({
    id,
    user_id: params.userId,
    operacion: params.operacion,
    huella: huellaOperacion(params.userId, params.operacion, params.datos),
    resumen: params.resumen,
    params: params.datos,
    estado: "emitido",
    expira_en: expiraEn,
  })

  if (error) throw new OperacionMcpError("No se pudo preparar la operacion.")

  return { id, operacion: params.operacion, resumen: params.resumen, params: params.datos, expiraEn }
}

/**
 * Toma el borrador de forma exclusiva. Si ya fue usado, cancelado, expiro o
 * pertenece a otra persona, no devuelve nada y la operacion no se ejecuta.
 */
export async function reclamarBorrador(
  admin: any,
  params: { id: string; userId: string }
): Promise<BorradorReclamado> {
  const { data, error } = await admin
    .from("mcp_operaciones")
    .update({ estado: "ejecutando" })
    .eq("id", params.id)
    .eq("user_id", params.userId)
    .eq("estado", "emitido")
    .gt("expira_en", new Date().toISOString())
    .select("id, operacion, params, resumen")
    .maybeSingle()

  if (error) throw new OperacionMcpError("No se pudo validar la confirmacion.")
  if (!data) {
    throw new OperacionMcpError(
      "Esa confirmacion ya no es valida: puede que ya se haya ejecutado, se haya cancelado o hayan pasado mas de " +
        `${TTL_BORRADOR_MINUTOS} minutos. Vuelve a pedir la operacion para revisar el borrador actualizado.`
    )
  }

  return {
    id: data.id,
    operacion: data.operacion,
    params: data.params || {},
    resumen: data.resumen,
  }
}

export async function marcarEjecutado(admin: any, id: string, resultado: unknown) {
  await admin
    .from("mcp_operaciones")
    .update({ estado: "ejecutado", resultado, ejecutado_en: new Date().toISOString() })
    .eq("id", id)
}

export async function marcarFallido(admin: any, id: string, mensaje: string) {
  await admin
    .from("mcp_operaciones")
    .update({ estado: "fallido", error: mensaje.slice(0, 500), ejecutado_en: new Date().toISOString() })
    .eq("id", id)
}

export async function cancelarBorrador(admin: any, params: { id: string; userId: string }): Promise<boolean> {
  const { data } = await admin
    .from("mcp_operaciones")
    .update({ estado: "cancelado" })
    .eq("id", params.id)
    .eq("user_id", params.userId)
    .eq("estado", "emitido")
    .select("id")
    .maybeSingle()

  return Boolean(data)
}
