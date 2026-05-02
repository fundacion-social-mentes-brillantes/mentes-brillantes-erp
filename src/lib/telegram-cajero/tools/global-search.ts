import type { SupabaseReader } from "./types"
import { toolResult } from "./types"

export async function searchGlobal(supabase: SupabaseReader, term: string) {
  const queryScope = { term }
  const normalized = term.trim()
  if (!/^\d+$/.test(normalized) && normalized.length < 3) {
    return toolResult({
      toolName: "searchGlobal",
      status: "empty",
      queryScope,
      sources: [],
      resultCount: 0,
      data: [],
      explanationHints: ["El termino es muy corto; pide mas detalle salvo codigo exacto."],
    })
  }

  const [asistentes, cuentas, egresos, ventas] = await Promise.all([
    supabase.from("asistentes").select("id, nombre, codigo, cedula").ilike("nombre", `%${normalized}%`).limit(5),
    supabase.from("cuentas_por_cobrar").select("id, concepto").ilike("concepto", `%${normalized}%`).limit(5),
    supabase.from("egresos").select("id, concepto, notas").or(`concepto.ilike.%${normalized}%,notas.ilike.%${normalized}%`).limit(5),
    supabase.from("ventas_externas").select("id, comprador_nombre, concepto, notas").or(`comprador_nombre.ilike.%${normalized}%,concepto.ilike.%${normalized}%,notas.ilike.%${normalized}%`).limit(5),
  ])

  const data = {
    asistentes: asistentes.error ? [] : asistentes.data || [],
    cuentas: cuentas.error ? [] : cuentas.data || [],
    egresos: egresos.error ? [] : egresos.data || [],
    ventas_externas: ventas.error ? [] : ventas.data || [],
  }
  const count = Object.values(data).reduce((acc, rows: any) => acc + rows.length, 0)

  return toolResult({
    toolName: "searchGlobal",
    status: count ? "ok" : "empty",
    queryScope,
    sources: ["asistentes", "cuentas_por_cobrar", "egresos", "ventas_externas"],
    resultCount: count,
    data,
  })
}
