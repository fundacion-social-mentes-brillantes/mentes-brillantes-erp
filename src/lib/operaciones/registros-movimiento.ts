import type { DbClient } from "@/lib/supabase/types"
import { toSafeNumber } from "@/lib/utils/contable"
import type { MetodoPago } from "./errores"

// Lectura y escritura de un movimiento suelto (abono, egreso, donacion o venta
// externa) sin importar en que tabla viva. Cada tipo tiene columnas distintas
// (el abono guarda la fecha en fecha_pago; la donacion no tiene concepto), asi
// que aqui se resuelve una sola vez y el resto del codigo trabaja con la forma
// normalizada de abajo.

export const TIPOS_MOVIMIENTO = ["abono", "egreso", "donacion", "venta_externa"] as const
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number]

export const TABLA_POR_TIPO = {
  abono: "pagos_abonos",
  egreso: "egresos",
  donacion: "donaciones_asistentes",
  venta_externa: "ventas_externas",
} as const satisfies Record<TipoMovimiento, string>

export type TablaMovimiento = (typeof TABLA_POR_TIPO)[TipoMovimiento]

export function esTipoMovimiento(tipo: string): tipo is TipoMovimiento {
  return (TIPOS_MOVIMIENTO as readonly string[]).includes(tipo)
}

/** Un movimiento leido de su tabla, con los campos que comparten todos los tipos. */
export type MovimientoLeido = {
  tipo: TipoMovimiento
  fecha: string
  monto: number
  notas: string | null
  estado: string | null
  /** Solo abonos: la cuenta que pagan. */
  cuentaId: string | null
  origenFondos: string | null
  metodoPago: string | null
  /** Concepto propio (egreso, venta) o el de la cuenta pagada (abono). */
  concepto: string | null
  compradorNombre: string | null
  personaNombre: string | null
  /** Solo egresos. */
  categoria: string | null
  /** Solo donaciones (en un abono, la persona es la de la cuenta). */
  asistenteId: string | null
}

type ConNombre = { nombre: string | null } | Array<{ nombre: string | null }> | null | undefined

function nombreDe(relacion: ConNombre): string | null {
  const fila = Array.isArray(relacion) ? relacion[0] : relacion
  return fila?.nombre ?? null
}

export async function leerMovimiento(
  supabase: DbClient,
  tipo: TipoMovimiento,
  id: string
): Promise<MovimientoLeido | null> {
  switch (tipo) {
    case "abono": {
      const { data, error } = await supabase
        .from("pagos_abonos")
        .select("cuenta_id, monto, fecha_pago, notas, estado, origen_fondos, metodo_pago, cuentas_por_cobrar(concepto, asistentes(nombre))")
        .eq("id", id)
        .single()
      if (error || !data) return null
      const cuenta = Array.isArray(data.cuentas_por_cobrar) ? data.cuentas_por_cobrar[0] : data.cuentas_por_cobrar
      return {
        tipo,
        fecha: data.fecha_pago,
        monto: toSafeNumber(data.monto),
        notas: data.notas,
        estado: data.estado,
        cuentaId: data.cuenta_id,
        origenFondos: data.origen_fondos,
        metodoPago: data.metodo_pago,
        concepto: cuenta?.concepto ?? null,
        compradorNombre: null,
        personaNombre: nombreDe(cuenta?.asistentes),
        categoria: null,
        asistenteId: null,
      }
    }
    case "egreso": {
      const { data, error } = await supabase
        .from("egresos")
        .select("fecha, notas, monto, concepto, estado, metodo_pago, categoria")
        .eq("id", id)
        .single()
      if (error || !data) return null
      return {
        tipo,
        fecha: data.fecha,
        monto: toSafeNumber(data.monto),
        notas: data.notas,
        estado: data.estado,
        cuentaId: null,
        origenFondos: null,
        metodoPago: data.metodo_pago,
        concepto: data.concepto,
        compradorNombre: null,
        personaNombre: null,
        categoria: data.categoria,
        asistenteId: null,
      }
    }
    case "donacion": {
      const { data, error } = await supabase
        .from("donaciones_asistentes")
        .select("fecha, notas, monto, estado, metodo_pago, asistente_id, asistentes(nombre)")
        .eq("id", id)
        .single()
      if (error || !data) return null
      return {
        tipo,
        fecha: data.fecha,
        monto: toSafeNumber(data.monto),
        notas: data.notas,
        estado: data.estado,
        cuentaId: null,
        origenFondos: null,
        metodoPago: data.metodo_pago,
        concepto: null,
        compradorNombre: null,
        personaNombre: nombreDe(data.asistentes),
        categoria: null,
        asistenteId: data.asistente_id,
      }
    }
    case "venta_externa": {
      const { data, error } = await supabase
        .from("ventas_externas")
        .select("fecha, notas, monto, concepto, comprador_nombre, estado, metodo_pago")
        .eq("id", id)
        .single()
      if (error || !data) return null
      return {
        tipo,
        fecha: data.fecha,
        monto: toSafeNumber(data.monto),
        notas: data.notas,
        estado: data.estado,
        cuentaId: null,
        origenFondos: null,
        metodoPago: data.metodo_pago,
        concepto: data.concepto,
        compradorNombre: data.comprador_nombre,
        personaNombre: null,
        categoria: null,
        asistenteId: null,
      }
    }
  }
}

/**
 * Cambios que se pueden aplicar a un movimiento. Cada tabla guarda cosas
 * distintas: la fecha del abono va en fecha_pago, la categoria solo existe en
 * egresos, la persona solo se cambia en una donacion y el comprador solo en una
 * venta externa. Lo que no aplica a un tipo se ignora aqui; quien llama debe
 * rechazarlo antes (ver previsualizarEdicion).
 */
export type CambiosMovimiento = {
  estado?: string
  notas?: string | null
  monto?: number
  fecha?: string
  concepto?: string
  metodoPago?: MetodoPago
  categoria?: string
  asistenteId?: string
  compradorNombre?: string | null
}

/** Tipos que tienen columna `concepto` propia. */
export function tieneConcepto(tipo: TipoMovimiento): tipo is "egreso" | "venta_externa" {
  return tipo === "egreso" || tipo === "venta_externa"
}

/** Quita las claves sin valor: un undefined no debe pisar nada en la base. */
function soloDefinidos<T extends Record<string, unknown>>(objeto: T): Partial<T> {
  return Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== undefined)) as Partial<T>
}

export async function actualizarMovimiento(
  supabase: DbClient,
  tipo: TipoMovimiento,
  id: string,
  cambios: CambiosMovimiento
) {
  const comunes = {
    estado: cambios.estado,
    notas: cambios.notas,
    monto: cambios.monto,
    metodo_pago: cambios.metodoPago,
  }
  switch (tipo) {
    case "abono":
      return supabase
        .from("pagos_abonos")
        .update(soloDefinidos({ ...comunes, fecha_pago: cambios.fecha }))
        .eq("id", id)
    case "egreso":
      return supabase
        .from("egresos")
        .update(soloDefinidos({ ...comunes, fecha: cambios.fecha, concepto: cambios.concepto, categoria: cambios.categoria }))
        .eq("id", id)
    case "donacion":
      return supabase
        .from("donaciones_asistentes")
        .update(soloDefinidos({ ...comunes, fecha: cambios.fecha, asistente_id: cambios.asistenteId }))
        .eq("id", id)
    case "venta_externa":
      return supabase
        .from("ventas_externas")
        .update(
          soloDefinidos({
            ...comunes,
            fecha: cambios.fecha,
            concepto: cambios.concepto,
            comprador_nombre: cambios.compradorNombre,
          })
        )
        .eq("id", id)
  }
}

export async function borrarMovimiento(supabase: DbClient, tipo: TipoMovimiento, id: string) {
  switch (tipo) {
    case "abono":
      return supabase.from("pagos_abonos").delete().eq("id", id)
    case "egreso":
      return supabase.from("egresos").delete().eq("id", id)
    case "donacion":
      return supabase.from("donaciones_asistentes").delete().eq("id", id)
    case "venta_externa":
      return supabase.from("ventas_externas").delete().eq("id", id)
  }
}
