import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"
import { toSafeNumber } from "@/lib/utils/contable"

export async function getCoachSessions(supabase: SupabaseReader, asistenteId: string) {
  const queryScope = { asistenteId }
  const [paquetes, sesiones] = await Promise.all([
    supabase.from("coach_paquetes").select("id, cuenta_id, sesiones_compradas").eq("asistente_id", asistenteId),
    supabase.from("coach_sesiones").select("id, fecha, notas, paquete_id").eq("asistente_id", asistenteId).order("fecha", { ascending: false }).limit(20),
  ])

  if (paquetes.error) return toolError("getCoachSessions", queryScope, "coach_paquetes", paquetes.error)
  if (sesiones.error) return toolError("getCoachSessions", queryScope, "coach_sesiones", sesiones.error)

  const compradas = (paquetes.data || []).reduce((acc: number, item: any) => acc + Math.round(toSafeNumber(item.sesiones_compradas)), 0)
  const realizadas = (sesiones.data || []).length
  return toolResult({
    toolName: "getCoachSessions",
    status: compradas || realizadas ? "ok" : "empty",
    queryScope,
    sources: ["coach_paquetes", "coach_sesiones"],
    resultCount: realizadas,
    data: { sesiones_compradas: compradas, sesiones_realizadas: realizadas, sesiones_restantes: Math.max(0, compradas - realizadas), sesiones: sesiones.data || [] },
  })
}
