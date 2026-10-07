import type { DbClient } from "@/lib/supabase/types"
import type { TablesInsert } from "@/types/database"

// Rastro de cada cambio de dinero en auditoria_financiera. Vive en un solo
// lugar porque la columna `motivo` es NOT NULL: cuando un canal mandaba null
// (un movimiento sin notas) el insert fallaba en silencio y el cambio quedaba
// sin rastro. Aqui el motivo siempre lleva texto y un fallo queda en el log.

export type FilaAuditoria = {
  tabla: string
  registroId: string
  usuarioId: string | null | undefined
  accion: string
  valorAnterior?: number | null
  valorNuevo?: number | null
  motivo?: string | null
}

export function filaAuditoria(
  fila: FilaAuditoria,
  motivoPorDefecto = "Sin motivo indicado"
): TablesInsert<"auditoria_financiera"> {
  return {
    tabla_afectada: fila.tabla,
    registro_id: fila.registroId,
    usuario_id: fila.usuarioId || "",
    accion: fila.accion,
    valor_anterior: fila.valorAnterior ?? null,
    valor_nuevo: fila.valorNuevo ?? null,
    motivo: (fila.motivo && fila.motivo.trim()) || motivoPorDefecto,
  }
}

/** Guarda una o varias filas de auditoria. Devuelve false si no se pudo (y lo deja en el log). */
export async function registrarAuditoria(
  supabase: DbClient,
  filas: FilaAuditoria | FilaAuditoria[],
  motivoPorDefecto?: string
): Promise<boolean> {
  const lista = Array.isArray(filas) ? filas : [filas]
  if (lista.length === 0) return true

  const { error } = await supabase
    .from("auditoria_financiera")
    .insert(lista.map((fila) => filaAuditoria(fila, motivoPorDefecto)))

  if (error) {
    console.error("[auditoria] no se pudo registrar", {
      acciones: lista.map((fila) => fila.accion),
      tablas: lista.map((fila) => fila.tabla),
      code: error.code,
    })
    return false
  }
  return true
}
