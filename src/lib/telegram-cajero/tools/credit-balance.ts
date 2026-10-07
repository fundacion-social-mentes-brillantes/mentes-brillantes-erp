import type { SupabaseReader } from "./types"
import { getPersonFinancialStatus } from "./person-finance"

export async function getPersonCreditBalance(supabase: SupabaseReader, asistenteId: string) {
  const result = await getPersonFinancialStatus(supabase, asistenteId)
  return { ...result, toolName: "getPersonCreditBalance", data: { saldo_a_favor: result.data?.saldo_a_favor || 0 } }
}
