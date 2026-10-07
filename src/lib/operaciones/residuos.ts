import { filtrarPagosValidos, sumarMontos } from "@/lib/utils/contable"
import type { DbClient } from "@/lib/supabase/types"
import { leerTodas } from "@/lib/supabase/paginar"
import { OperacionError } from "./errores"

// Cuentas que no pueden cerrarse por un residuo de centavos.
//
// Salio revisando la contabilidad: una cuenta de $68.000 con $67.999,98
// abonados queda "parcial" para siempre por 2 centavos. Ademas de no cerrarse,
// descuadra los conteos: `conteos` la cuenta como pendiente y
// `cartera_pendiente` la descarta por no tener saldo en pesos.
//
// Solo informa. Ajustar la cifra es una decision de quien lleva la contabilidad.

/** Por debajo de un peso no existe forma de pagarlo: es residuo, no deuda. */
const UMBRAL_PESOS = 1

export type CuentaConResiduo = {
  cuentaId: string
  codigo: string | null
  persona: string
  concepto: string
  valorTotal: number
  pagado: number
  residuo: number
  estado: string
}

export async function buscarCuentasConResiduo(admin: DbClient): Promise<CuentaConResiduo[]> {
  // Por paginas: hay cientos de cuentas abiertas y la API corta en 1000.
  let data
  try {
    data = await leerTodas((desde, hasta) =>
      admin
        .from("cuentas_por_cobrar")
        .select("id, concepto, valor_total, estado, asistentes(codigo, nombre), pagos_abonos(monto, estado, notas)")
        .in("estado", ["pendiente", "parcial"])
        .order("id")
        .range(desde, hasta)
    )
  } catch {
    throw new OperacionError("No se pudieron leer las cuentas.")
  }

  const resultado: CuentaConResiduo[] = []

  for (const cuenta of data || []) {
    // Un pago anulado no cuenta (doble marca: estado y nota), igual que en el
    // resto del sistema.
    const pagado = sumarMontos(filtrarPagosValidos(cuenta.pagos_abonos || []))

    const valorTotal = Number(cuenta.valor_total || 0)
    const residuo = valorTotal - pagado
    if (residuo <= 0 || residuo >= UMBRAL_PESOS) continue

    const persona = Array.isArray(cuenta.asistentes) ? cuenta.asistentes[0] : cuenta.asistentes

    resultado.push({
      cuentaId: cuenta.id,
      codigo: persona?.codigo ?? null,
      persona: persona?.nombre || "(sin nombre)",
      concepto: cuenta.concepto,
      valorTotal,
      pagado,
      residuo: Number(residuo.toFixed(2)),
      estado: cuenta.estado,
    })
  }

  return resultado.sort((a, b) => b.residuo - a.residuo)
}
