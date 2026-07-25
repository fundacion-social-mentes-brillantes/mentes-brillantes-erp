import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

// Historial general: los ultimos movimientos de TODO el ERP mezclados (pagos,
// egresos, donaciones, ventas externas, cuentas y saldo a favor), tal como los
// muestra la pagina de Movimientos. Es lo que responde "¿donde voy?" o "¿que
// se registro ultimamente?", que antes no tenia herramienta.

export const TIPOS_MOVIMIENTO = [
  "abono",
  "egreso",
  "donacion",
  "venta_externa",
  "cuenta_cobrar",
  "anticipo",
  "aplicacion_saldo",
] as const

export async function getRecentMovements(
  supabase: SupabaseReader,
  limit = 15,
  tipo?: string | null
) {
  const tope = Math.min(Math.max(Math.floor(limit) || 15, 1), 100)
  const queryScope: Record<string, unknown> = { limite: tope, tipo: tipo || null }

  let query = (supabase as any)
    .from("vw_movimientos_generales")
    .select(
      "movimiento_id, fecha, tipo_movimiento, asistente_nombre, concepto, metodo_pago, valor_ingreso, valor_egreso, valor_deuda, estado_o_saldo, categoria, creado_en"
    )

  if (tipo) query = query.eq("tipo_movimiento", tipo)

  // creado_en refleja cuando se REGISTRO (que es lo que se pregunta al decir
  // "los ultimos movimientos"); fecha es la fecha contable y puede ser previa.
  const { data, error } = await query
    .order("creado_en", { ascending: false, nullsFirst: false })
    .order("fecha", { ascending: false })
    .limit(tope)

  if (error) return toolError("getRecentMovements", queryScope, "vw_movimientos_generales", error)

  const filas = (data || []).map((m: any) => ({
    id: m.movimiento_id,
    fecha: m.fecha,
    registrado_en: m.creado_en,
    tipo: m.tipo_movimiento,
    persona: m.asistente_nombre || null,
    concepto: m.concepto,
    metodo_pago: m.metodo_pago || null,
    categoria: m.categoria || null,
    ingreso: Number(m.valor_ingreso || 0),
    egreso: Number(m.valor_egreso || 0),
    valor_cuenta: Number(m.valor_deuda || 0),
    estado: m.estado_o_saldo || null,
  }))

  return toolResult({
    toolName: "getRecentMovements",
    status: filas.length ? "ok" : "empty",
    queryScope,
    sources: ["vw_movimientos_generales"],
    resultCount: filas.length,
    data: filas,
    explanationHints: [
      "Ordenado por cuando se registro cada movimiento, no por su fecha contable.",
      "Los movimientos anulados aparecen con su estado; no cuentan en los totales.",
    ],
  })
}
