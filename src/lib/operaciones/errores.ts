import type { DbClient } from "@/lib/supabase/types"
import { cargarMediosPago, esClaveDeMedio, mediosActivos, resolverClaveMedio } from "@/lib/medios-pago"
import { Constants, type Enums } from "@/types/database"

/**
 * Error cuyo mensaje esta redactado para mostrarselo a la persona: dice por
 * que se rechazo la operacion y que puede hacer. La marca `esParaUsuario`
 * permite al MCP entregarlo tal cual en vez del mensaje generico de error
 * interno, que dejaba a la gente sin saber como continuar.
 */
export class OperacionError extends Error {
  readonly esParaUsuario = true
}

/**
 * La operacion era valida pero no cambiaba nada (los datos ya eran esos). El
 * MCP lo muestra como cualquier otro aviso; la web lo trata como "guardado".
 */
export class SinCambiosError extends OperacionError {}

/**
 * La operacion alcanzo a escribir una parte antes de fallar. Su mensaje dice
 * que quedo hecho y que falta: nadie debe decirle a la persona "no se
 * registro nada" cuando si se registro algo.
 */
export class OperacionParcialError extends OperacionError {}

export function exigir(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new OperacionError(mensaje)
}

export function exigirMontoPositivo(monto: unknown, etiqueta = "El monto"): number {
  const n = Number(monto)
  if (!Number.isFinite(n) || n <= 0) {
    throw new OperacionError(`${etiqueta} debe ser mayor a 0.`)
  }
  return n
}

/** Los valores que acepta la columna metodo_pago (incluye saldo_a_favor, que lo pone el sistema). */
export type MetodoPago = Enums<"metodo_pago">
const METODOS_PAGO_VALIDOS: readonly string[] = Constants.public.Enums.metodo_pago

/** Vale una clave del tipo metodo_pago o una cuenta de medios_pago (las que agrega el admin). */
export function esMetodoPago(valor: unknown): valor is MetodoPago {
  return typeof valor === "string" && (METODOS_PAGO_VALIDOS.includes(valor) || esClaveDeMedio(valor))
}

function listaDeCuentas(): string {
  const claves = mediosActivos().map((m) => m.clave)
  return claves.length > 1 ? `${claves.slice(0, -1).join(", ")} u ${claves[claves.length - 1]}` : claves.join("")
}

/**
 * Antes un metodo mal escrito llegaba hasta la base de datos y volvia con un
 * error tecnico; aqui se rechaza con un mensaje que dice que valores sirven.
 *
 * "saldo_a_favor" solo lo pone el sistema (al aplicar saldo). Dejar que una
 * persona lo escriba a mano haria que un pago de verdad dejara de contar como
 * ingreso, asi que por defecto se rechaza.
 */
export function exigirMetodoPago(
  valor: unknown,
  etiqueta = "El metodo de pago",
  opciones: { permitirSaldoAFavor?: boolean } = {}
): MetodoPago {
  const limpio = String(valor ?? "").trim()
  if (!limpio) throw new OperacionError(`${etiqueta} es obligatorio.`)
  if (!esMetodoPago(limpio) || (limpio === "saldo_a_favor" && !opciones.permitirSaldoAFavor)) {
    throw new OperacionError(`${etiqueta} "${limpio}" no sirve aqui. Usa ${listaDeCuentas()}.`)
  }
  return limpio
}

/**
 * Igual que exigirMetodoPago, pero antes lee las cuentas de la base: asi una
 * cuenta que el admin acaba de agregar en Configuracion ya sirve, aunque este
 * servidor no la haya visto todavia.
 */
export async function exigirMedioPago(
  supabase: DbClient,
  valor: unknown,
  etiqueta = "El metodo de pago",
  opciones: { permitirSaldoAFavor?: boolean } = {}
): Promise<MetodoPago> {
  const limpio = String(valor ?? "").trim()
  await cargarMediosPago(supabase)
  // Tambien sirve el nombre de la cuenta ("Banco Caja Social"): se traduce a su clave.
  let clave = resolverClaveMedio(limpio) ?? limpio
  if (clave && !esMetodoPago(clave)) {
    // Puede ser una cuenta recien creada que este servidor aun no conoce.
    await cargarMediosPago(supabase, { forzar: true })
    clave = resolverClaveMedio(limpio) ?? limpio
  }
  return exigirMetodoPago(clave, etiqueta, opciones)
}

export function exigirFechaIso(fecha: unknown, etiqueta = "La fecha"): string {
  const s = String(fecha || "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new OperacionError(`${etiqueta} debe tener el formato AAAA-MM-DD.`)
  }
  return s
}
