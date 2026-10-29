import type { DbClient } from "@/lib/supabase/types"
import { cargarMediosPago, type MedioPago } from "@/lib/medios-pago"
import { OperacionError, exigir } from "./errores"

// Administrar las cuentas de dinero (tabla medios_pago). Pedido de Sebastian
// (2026-10-29): poder cambiar el nombre de una cuenta, agregar otra u ocultar
// una que ya no se use "sin que se dane nada". Por eso:
//   - el nombre se cambia libremente: los pagos guardan la clave, no el nombre;
//   - una cuenta nunca se borra (los pagos viejos la siguen nombrando): se oculta;
//   - una cuenta nueva la crea fn_crear_medio_pago, que le inventa la clave.
// Solo el admin (lo exigen la web, el MCP y las politicas de la tabla).

function limpiarNombre(nombre: unknown): string {
  const limpio = String(nombre ?? "").replace(/\s+/g, " ").trim()
  exigir(limpio.length >= 2 && limpio.length <= 60, "El nombre de la cuenta debe tener entre 2 y 60 letras.")
  return limpio
}

function traducir(mensaje: string): string {
  if (/medios_pago_nombre_unico|duplicate key/i.test(mensaje)) return "Ya hay una cuenta que se llama así."
  return mensaje
}

async function leer(supabase: DbClient): Promise<MedioPago[]> {
  return cargarMediosPago(supabase, { forzar: true })
}

export async function crearMedioPago(supabase: DbClient, nombre: unknown): Promise<MedioPago> {
  const limpio = limpiarNombre(nombre)
  const { data, error } = await supabase.rpc("fn_crear_medio_pago", { p_nombre: limpio })
  if (error || !data) throw new OperacionError(traducir(error?.message || "No se pudo crear la cuenta."))
  const lista = await leer(supabase)
  return lista.find((m) => m.clave === data) ?? { clave: data, nombre: limpio, activo: true, orden: 0 }
}

export async function renombrarMedioPago(supabase: DbClient, clave: string, nombre: unknown) {
  const limpio = limpiarNombre(nombre)
  const { data, error } = await supabase
    .from("medios_pago")
    .update({ nombre: limpio, actualizado_en: new Date().toISOString() })
    .eq("clave", clave)
    .select("clave")
  if (error) throw new OperacionError(traducir(error.message))
  if (!data || data.length === 0) throw new OperacionError("No encontré esa cuenta.")
  await leer(supabase)
  return limpio
}

export async function cambiarMedioPagoActivo(supabase: DbClient, clave: string, activo: boolean) {
  const lista = await leer(supabase)
  if (!lista.some((m) => m.clave === clave)) throw new OperacionError("No encontré esa cuenta.")
  if (!activo && lista.filter((m) => m.activo && m.clave !== clave).length === 0) {
    throw new OperacionError("Debe quedar por lo menos una cuenta activa.")
  }
  const { error } = await supabase
    .from("medios_pago")
    .update({ activo, actualizado_en: new Date().toISOString() })
    .eq("clave", clave)
  if (error) throw new OperacionError(error.message)
  await leer(supabase)
}

/** Sube o baja una cuenta en la lista (el orden en que aparece en los formularios). */
export async function moverMedioPago(supabase: DbClient, clave: string, direccion: "arriba" | "abajo") {
  const lista = await leer(supabase)
  const i = lista.findIndex((m) => m.clave === clave)
  if (i < 0) throw new OperacionError("No encontré esa cuenta.")
  const j = direccion === "arriba" ? i - 1 : i + 1
  if (j < 0 || j >= lista.length) return
  // Se renumera toda la lista de 10 en 10 para que nunca queden dos con el mismo orden.
  const nueva = [...lista]
  ;[nueva[i], nueva[j]] = [nueva[j], nueva[i]]
  for (const [k, m] of nueva.entries()) {
    const orden = (k + 1) * 10
    if (m.orden !== orden) {
      const { error } = await supabase.from("medios_pago").update({ orden }).eq("clave", m.clave)
      if (error) throw new OperacionError(error.message)
    }
  }
  await leer(supabase)
}
