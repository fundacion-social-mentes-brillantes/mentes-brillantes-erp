import type { DbClient } from "@/lib/supabase/types"
import type { Enums } from "@/types/database"
import { calcularEstadoCuentaDesdePagos, toSafeNumber } from "@/lib/utils/contable"

export const PAGOS_DE_CUENTA = "pagos_abonos(id, monto, estado, notas, metodo_pago, origen_fondos)"

/**
 * Relee la cuenta y guarda su estado (pendiente / parcial / pagado) segun los
 * pagos vigentes. La base ya lo hace con el trigger trg_estado_cuenta cada vez
 * que cambia un pago; esto es la segunda red desde la app, y la UNICA cuando lo
 * que cambia es el valor de la cuenta (el trigger solo escucha pagos_abonos).
 *
 * Devuelve el estado nuevo, o null si la cuenta no se pudo leer.
 */
export async function recalcularEstadoCuenta(
  supabase: DbClient,
  cuentaId: string | null | undefined
): Promise<Enums<"estado_cuenta"> | null> {
  if (!cuentaId) return null
  const { data } = await supabase
    .from("cuentas_por_cobrar")
    .select(`valor_total, ${PAGOS_DE_CUENTA}`)
    .eq("id", cuentaId)
    .single()
  if (!data) return null

  const estado = calcularEstadoCuentaDesdePagos(toSafeNumber(data.valor_total), data.pagos_abonos || [])
  const { error } = await supabase.from("cuentas_por_cobrar").update({ estado }).eq("id", cuentaId)
  if (error) {
    console.error("[operaciones] no se pudo guardar el estado recalculado", { cuentaId, code: error.code })
  }
  return estado
}
