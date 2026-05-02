import type { SupabaseReader } from "./types"
import { getPersonFinancialStatus } from "./person-finance"

export async function getPersonOpenBalances(supabase: SupabaseReader, asistenteId: string) {
  const result = await getPersonFinancialStatus(supabase, asistenteId)
  const data: any = result.data || {}
  return { ...result, toolName: "getPersonOpenBalances", data: { cuentas: (data.cuentas || []).filter((c: any) => c.pendiente > 0), total_pendiente: data.total_pendiente || 0 } }
}
