import { toSafeNumber } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

function money(value: unknown) {
  return Math.round(toSafeNumber(value))
}

function norm(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

// Socios y su liquidacion/reparto mas reciente. SOLO LECTURA: lee los valores ya
// calculados por el modulo web (liquidaciones_socios), no recalcula contabilidad.
export async function getPartnerSettlement(supabase: SupabaseReader, socioQuery?: string | null) {
  const queryScope = { socioQuery: socioQuery || null }
  const { data: sociosData, error: sociosErr } = await supabase
    .from("socios")
    .select("id, nombre, porcentaje_participacion, activo")
    .order("nombre", { ascending: true })

  if (sociosErr) return toolError("getPartnerSettlement", queryScope, "socios", sociosErr)

  let socios = (sociosData || []) as any[]
  const q = socioQuery ? norm(socioQuery) : ""
  if (q) {
    const filtered = socios.filter((socio) => norm(socio.nombre).includes(q))
    if (filtered.length) socios = filtered
  }

  if (!socios.length) {
    return toolResult({
      toolName: "getPartnerSettlement",
      status: "empty",
      queryScope,
      sources: ["socios"],
      resultCount: 0,
      data: { socios: [] },
    })
  }

  const ids = socios.map((socio) => socio.id)
  const { data: liqData } = await supabase
    .from("liquidaciones_socios")
    .select("socio_id, valor_neto_pagar, valor_correspondiente, adelantos_descontados, utilidad_neta, generado_en, periodos(nombre)")
    .in("socio_id", ids)
    .order("generado_en", { ascending: false })

  const ultimaPorSocio = new Map<string, any>()
  for (const liq of (liqData || []) as any[]) {
    if (!ultimaPorSocio.has(liq.socio_id)) ultimaPorSocio.set(liq.socio_id, liq)
  }

  const result = socios.map((socio) => {
    const liq = ultimaPorSocio.get(socio.id)
    const periodo = liq ? (Array.isArray(liq.periodos) ? liq.periodos[0] : liq.periodos) : null
    return {
      nombre: socio.nombre,
      activo: socio.activo,
      porcentaje: toSafeNumber(socio.porcentaje_participacion),
      ultima_liquidacion: liq
        ? {
            periodo: periodo?.nombre || null,
            valor_neto_pagar: money(liq.valor_neto_pagar),
            valor_correspondiente: money(liq.valor_correspondiente),
            adelantos_descontados: money(liq.adelantos_descontados),
            utilidad_neta: money(liq.utilidad_neta),
          }
        : null,
    }
  })

  return toolResult({
    toolName: "getPartnerSettlement",
    status: "ok",
    queryScope,
    sources: ["socios", "liquidaciones_socios"],
    resultCount: result.length,
    data: { socios: result },
  })
}
