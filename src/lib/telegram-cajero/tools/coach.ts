import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"
import { toSafeNumber } from "@/lib/utils/contable"
import { fetchPaginatedRows, partialPaginationMessage } from "./pagination"

function toDateMs(value: unknown) {
  const date = new Date(String(value || ""))
  const time = date.getTime()
  return Number.isFinite(time) ? time : 0
}

function esConceptoCoach(concepto: unknown) {
  const normalized = String(concepto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
  return normalized.includes("coach") || normalized.includes("sesion")
}

export async function getCoachSessions(supabase: SupabaseReader, asistenteId: string) {
  const queryScope = { asistenteId }
  const [paquetes, sesiones, cuentasCoach] = await Promise.all([
    fetchPaginatedRows<any>(
      (withExactCount) =>
        supabase
          .from("coach_paquetes")
          .select(
            "id, cuenta_id, sesiones_compradas, notas, creado_en, cuentas_por_cobrar(concepto, valor_total, fecha_emision, estado)",
            withExactCount ? { count: "exact" } : undefined
          )
          .eq("asistente_id", asistenteId),
      { rowKey: "id", pageSize: 200, maxRows: 5_000 }
    ),
    fetchPaginatedRows<any>(
      (withExactCount) =>
        supabase
          .from("coach_sesiones")
          .select(
            "id, fecha, notas, paquete_id, creado_en",
            withExactCount ? { count: "exact" } : undefined
          )
          .eq("asistente_id", asistenteId),
      { rowKey: "id", pageSize: 200, maxRows: 5_000 }
    ),
    // Sesiones que vienen de la MIGRACION: cuentas con concepto de sesion/coach.
    fetchPaginatedRows<any>(
      (withExactCount) =>
        supabase
          .from("cuentas_por_cobrar")
          .select(
            "id, concepto, valor_total, fecha_emision, estado",
            withExactCount ? { count: "exact" } : undefined
          )
          .eq("asistente_id", asistenteId),
      { rowKey: "id", pageSize: 200, maxRows: 5_000 }
    ),
  ])

  if (paquetes.error && paquetes.rows.length === 0) {
    return toolError("getCoachSessions", queryScope, "coach_paquetes", paquetes.error)
  }
  if (sesiones.error && sesiones.rows.length === 0) {
    return toolError("getCoachSessions", queryScope, "coach_sesiones", sesiones.error)
  }

  const paquetesRows = paquetes.rows
  const sesionesDesc = [...sesiones.rows].sort((a: any, b: any) => toDateMs(b.fecha) - toDateMs(a.fecha))
  const sesionesAsc = [...sesionesDesc].reverse()
  const compradasConsultadas = paquetesRows.reduce(
    (acc: number, item: any) => acc + Math.round(toSafeNumber(item.sesiones_compradas)),
    0
  )
  const realizadasConsultadas = sesionesDesc.length
  const compradas = paquetes.pagination.complete ? compradasConsultadas : null
  const realizadas = sesiones.pagination.complete ? realizadasConsultadas : null
  const restantes =
    compradas !== null && realizadas !== null ? Math.max(0, compradas - realizadas) : null
  const ultimaSesion = sesionesDesc[0] || null
  const primeraSesion = sesiones.pagination.complete ? sesionesAsc[0] || null : null

  // Migracion: cuentas de "sesion coach" NO ligadas a un paquete del modulo
  // (asi no se cuentan doble con quienes ya estan en el modulo nuevo).
  const cuentasLigadas = new Set(paquetesRows.map((paquete: any) => paquete.cuenta_id).filter(Boolean))
  const cuentasMigradas = paquetes.pagination.complete
    ? cuentasCoach.rows
        .filter((cuenta: any) => esConceptoCoach(cuenta.concepto) && !cuentasLigadas.has(cuenta.id))
        .map((cuenta: any) => ({
          concepto: cuenta.concepto,
          fecha: cuenta.fecha_emision,
          valor: Math.round(toSafeNumber(cuenta.valor_total)),
          estado: cuenta.estado,
        }))
    : []
  const migracionComplete = paquetes.pagination.complete && cuentasCoach.pagination.complete
  const sesionesMigradasConsultadas = cuentasMigradas.length
  const sesionesMigradas = migracionComplete ? sesionesMigradasConsultadas : null
  const fechasMigradas = cuentasMigradas.map((cuenta: any) => cuenta.fecha).filter(Boolean)
  const totalTomadas =
    realizadas !== null && sesionesMigradas !== null ? realizadas + sesionesMigradas : null
  const complete =
    paquetes.pagination.complete && sesiones.pagination.complete && cuentasCoach.pagination.complete
  const warnings = [
    !paquetes.pagination.complete
      ? partialPaginationMessage("paquetes coach", paquetes.pagination)
      : null,
    !sesiones.pagination.complete
      ? partialPaginationMessage("sesiones coach", sesiones.pagination)
      : null,
    !cuentasCoach.pagination.complete
      ? partialPaginationMessage("cuentas historicas de sesiones coach", cuentasCoach.pagination)
      : null,
  ].filter((message): message is string => Boolean(message))
  const knownTaken = realizadasConsultadas + sesionesMigradasConsultadas

  return toolResult({
    toolName: "getCoachSessions",
    status: complete
      ? compradasConsultadas || realizadasConsultadas || sesionesMigradasConsultadas
        ? "ok"
        : "empty"
      : "partial",
    queryScope: { ...queryScope, maxRowsPerSource: 5_000 },
    sources: ["coach_paquetes", "coach_sesiones", "cuentas_por_cobrar"],
    resultCount: knownTaken,
    data: {
      sesiones_compradas: compradas,
      sesiones_realizadas: realizadas,
      sesiones_restantes: restantes,
      sesiones_compradas_consultadas: compradasConsultadas,
      sesiones_realizadas_consultadas: realizadasConsultadas,
      // Sesiones tomadas contando modulo nuevo + registros migrados.
      sesiones_tomadas_total: totalTomadas,
      sesiones_migradas: sesionesMigradas,
      sesiones_migradas_consultadas: sesionesMigradasConsultadas,
      sesiones_tomadas_consultadas: knownTaken,
      fechas_migradas: fechasMigradas,
      detalle_migradas: cuentasMigradas,
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
        tiene_paquete_activo: compradas === null ? null : compradas > 0,
        hay_sesiones_registradas:
          realizadasConsultadas > 0 ? true : realizadas === null ? null : false,
        tiene_sesiones_migradas:
          sesionesMigradasConsultadas > 0 ? true : sesionesMigradas === null ? null : false,
        estado: !complete
          ? "datos_parciales"
          : Number(restantes) > 0
            ? "con_sesiones_restantes"
            : Number(compradas) > 0
              ? "sin_sesiones_restantes"
              : Number(sesionesMigradas) > 0
                ? "solo_migracion"
                : "sin_paquete_registrado",
      },
      nota_migracion:
        sesionesMigradas !== null && sesionesMigradas > 0 && compradas === 0
          ? "Esta persona no tiene paquete en el modulo nuevo, pero tiene registros de sesion coach que vienen de la migracion (cuentas de 'sesion coach'). Esas cuentas SON sus sesiones tomadas; reporta la cantidad y las fechas (fecha de emision de cada cuenta)."
          : null,
      pagination: {
        complete,
        truncated: !complete,
        coach_paquetes: paquetes.pagination,
        coach_sesiones: sesiones.pagination,
        cuentas_por_cobrar: cuentasCoach.pagination,
      },
    },
    explanationHints: warnings,
    userSafeErrors: warnings,
  })
}
