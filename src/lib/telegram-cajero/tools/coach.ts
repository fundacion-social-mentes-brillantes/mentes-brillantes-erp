import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"
import { toSafeNumber } from "@/lib/utils/contable"

function toDateMs(value: unknown) {
  const date = new Date(String(value || ""))
  const time = date.getTime()
  return Number.isFinite(time) ? time : 0
}

export async function getCoachSessions(supabase: SupabaseReader, asistenteId: string) {
  const queryScope = { asistenteId }
  const [paquetes, sesiones] = await Promise.all([
    supabase
      .from("coach_paquetes")
      .select("id, cuenta_id, sesiones_compradas, notas, creado_en, cuentas_por_cobrar(concepto, valor_total, fecha_emision, estado)")
      .eq("asistente_id", asistenteId),
    supabase
      .from("coach_sesiones")
      .select("id, fecha, notas, paquete_id, creado_en")
      .eq("asistente_id", asistenteId)
      .order("fecha", { ascending: false })
      .limit(50),
  ])

  if (paquetes.error) return toolError("getCoachSessions", queryScope, "coach_paquetes", paquetes.error)
  if (sesiones.error) return toolError("getCoachSessions", queryScope, "coach_sesiones", sesiones.error)

  const paquetesRows = paquetes.data || []
  const sesionesDesc = [...(sesiones.data || [])].sort((a: any, b: any) => toDateMs(b.fecha) - toDateMs(a.fecha))
  const sesionesAsc = [...sesionesDesc].reverse()
  const compradas = paquetesRows.reduce((acc: number, item: any) => acc + Math.round(toSafeNumber(item.sesiones_compradas)), 0)
  const realizadas = sesionesDesc.length
  const restantes = Math.max(0, compradas - realizadas)
  const ultimaSesion = sesionesDesc[0] || null
  const primeraSesion = sesionesAsc[0] || null

  return toolResult({
    toolName: "getCoachSessions",
    status: compradas || realizadas ? "ok" : "empty",
    queryScope,
    sources: ["coach_paquetes", "coach_sesiones", "cuentas_por_cobrar"],
    resultCount: realizadas,
    data: {
      sesiones_compradas: compradas,
      sesiones_realizadas: realizadas,
      sesiones_restantes: restantes,
      fechas_tomadas: sesionesAsc.map((sesion: any) => sesion.fecha).filter(Boolean),
      primera_sesion: primeraSesion,
      ultima_sesion: ultimaSesion,
      sesiones: sesionesDesc,
      paquetes: paquetesRows.map((paquete: any) => ({
        id: paquete.id,
        cuenta_id: paquete.cuenta_id,
        sesiones_compradas: Math.round(toSafeNumber(paquete.sesiones_compradas)),
        notas: paquete.notas || null,
        creado_en: paquete.creado_en,
        cuenta: paquete.cuentas_por_cobrar || null,
      })),
      interpretacion: {
        tiene_paquete_activo: compradas > 0,
        hay_sesiones_registradas: realizadas > 0,
        estado: restantes > 0 ? "con_sesiones_restantes" : compradas > 0 ? "sin_sesiones_restantes" : "sin_paquete_registrado",
      },
    },
  })
}
