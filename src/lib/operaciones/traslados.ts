import type { DbClient } from "@/lib/supabase/types"
import { assertFechaEditable } from "@/lib/utils/periodos"
import { nombreMedio } from "@/lib/medios-pago"
import { registrarAuditoria } from "./auditoria"
import type { ActorErp } from "./abonos"
import { OperacionError, exigir, exigirFechaIso, exigirMedioPago, exigirMontoPositivo, type MetodoPago } from "./errores"

// Traslados entre cuentas propias de la fundacion (tabla traslados_cuentas):
// por ejemplo, pasar plata de Nequi al Banco Caja Social o consignar el
// efectivo en el banco.
//
// No es ingreso ni gasto: no cambia la utilidad ni la liquidacion de los
// socios. Solo mueve el saldo de cada cuenta en el "Resumen por cuenta" de la
// liquidacion (y en su cierre, fn_cerrar_liquidacion_impl). Lo registra el
// admin; uno equivocado no se borra: se anula, y ambos quedan en la auditoria.
//
// Igual que el resto de lib/operaciones, aqui viven las reglas y la web y el
// MCP solo deciden quien puede llamar.

export type DatosTraslado = {
  monto: number
  /** Clave de la cuenta de donde sale la plata. */
  origen: string
  /** Clave de la cuenta a donde llega. */
  destino: string
  fecha: string
  notas?: string | null
}

export type TrasladoValidado = {
  monto: number
  origen: MetodoPago
  destino: MetodoPago
  fecha: string
  notas: string | null
  /** "Nequi → Banco Caja Social", para mostrar. */
  descripcion: string
}

export type TrasladoGuardado = {
  id: string
  fecha: string
  monto: number
  metodo_origen: string
  metodo_destino: string
  notas: string | null
  estado: string
  creado_en: string
  motivo_anulacion: string | null
}

const CAMPOS = "id, fecha, monto, metodo_origen, metodo_destino, notas, estado, creado_en, motivo_anulacion"

/** Revisa los datos sin escribir nada (es lo que el MCP muestra como borrador). */
export async function validarTraslado(supabase: DbClient, datos: DatosTraslado): Promise<TrasladoValidado> {
  const monto = exigirMontoPositivo(datos.monto)
  const fecha = exigirFechaIso(datos.fecha)
  const origen = await exigirMedioPago(supabase, datos.origen, "La cuenta de donde sale la plata")
  const destino = await exigirMedioPago(supabase, datos.destino, "La cuenta a donde llega la plata")
  exigir(origen !== destino, "La cuenta de donde sale y la cuenta a donde llega deben ser distintas.")

  const error = await assertFechaEditable(supabase, fecha, "Registrar el traslado")
  if (error) throw new OperacionError(error)

  const notas = datos.notas ? String(datos.notas).trim() || null : null
  return { monto, origen, destino, fecha, notas, descripcion: `${nombreMedio(origen)} → ${nombreMedio(destino)}` }
}

export async function registrarTraslado(supabase: DbClient, actor: ActorErp, datos: DatosTraslado) {
  const t = await validarTraslado(supabase, datos)
  const { data, error } = await supabase
    .from("traslados_cuentas")
    .insert([
      {
        fecha: t.fecha,
        monto: t.monto,
        metodo_origen: t.origen,
        metodo_destino: t.destino,
        notas: t.notas,
        usuario_id: actor.userId || null,
      },
    ])
    .select("id")
    .single()
  if (error || !data) throw new OperacionError(error?.message || "No se pudo registrar el traslado.")

  await registrarAuditoria(
    supabase,
    {
      tabla: "traslados_cuentas",
      registroId: data.id,
      usuarioId: actor.userId,
      accion: "crear_traslado",
      valorNuevo: t.monto,
      motivo: t.notas ? `Traslado ${t.descripcion}: ${t.notas}` : `Traslado ${t.descripcion}`,
    },
    "Traslado entre cuentas"
  )
  return { id: data.id, ...t }
}

async function leerTraslado(supabase: DbClient, id: string): Promise<TrasladoGuardado | null> {
  const { data, error } = await supabase.from("traslados_cuentas").select(CAMPOS).eq("id", id).maybeSingle()
  if (error) throw new OperacionError(error.message)
  return (data as TrasladoGuardado | null) ?? null
}

/** Revisa que el traslado se pueda anular, sin escribir nada. */
export async function validarAnulacionTraslado(supabase: DbClient, trasladoId: string, motivo: string) {
  exigir(trasladoId, "Falta indicar el traslado.")
  const razon = String(motivo || "").trim()
  exigir(razon.length >= 3, "Escribe por qué se anula el traslado.")
  const traslado = await leerTraslado(supabase, trasladoId)
  if (!traslado) throw new OperacionError("No encontré ese traslado.")
  if (traslado.estado === "anulado") throw new OperacionError("Ese traslado ya está anulado.")
  const error = await assertFechaEditable(supabase, traslado.fecha, "Anular el traslado")
  if (error) throw new OperacionError(error)
  return { traslado, motivo: razon }
}

export async function anularTraslado(supabase: DbClient, actor: ActorErp, trasladoId: string, motivo: string) {
  const { traslado, motivo: razon } = await validarAnulacionTraslado(supabase, trasladoId, motivo)
  const { error } = await supabase
    .from("traslados_cuentas")
    .update({ estado: "anulado", anulado_en: new Date().toISOString(), anulado_por: actor.userId || null, motivo_anulacion: razon })
    .eq("id", trasladoId)
    .eq("estado", "activo")
  if (error) throw new OperacionError(error.message)

  await registrarAuditoria(
    supabase,
    {
      tabla: "traslados_cuentas",
      registroId: trasladoId,
      usuarioId: actor.userId,
      accion: "anular_traslado",
      valorAnterior: Number(traslado.monto),
      valorNuevo: 0,
      motivo: razon,
    },
    "Anulación de traslado"
  )
  return traslado
}

/** Los traslados mas recientes (los anulados tambien, marcados). */
export async function listarTraslados(
  supabase: DbClient,
  opciones: { desde?: string; hasta?: string; limite?: number } = {}
): Promise<TrasladoGuardado[]> {
  let consulta = supabase.from("traslados_cuentas").select(CAMPOS)
  if (opciones.desde) consulta = consulta.gte("fecha", opciones.desde)
  if (opciones.hasta) consulta = consulta.lte("fecha", opciones.hasta)
  const { data, error } = await consulta
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(opciones.limite ?? 50)
  if (error) throw new OperacionError(error.message)
  return (data as TrasladoGuardado[] | null) ?? []
}
