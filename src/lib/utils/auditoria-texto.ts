// Como se le muestra a una persona una fila de auditoria_financiera.
//
// La auditoria guarda acciones tecnicas ("crear_abono", "edicion_valor"...).
// Antes el detalle de la cuenta mostraba todo lo que no fuera "edicion_valor"
// como "Edicion de Abono $0 -> $40.000", aunque fuera un pago nuevo.

type Accion = { titulo: string; tipo: "nuevo" | "cambio" | "baja" }

const ACCIONES: Record<string, Accion> = {
  crear_cuenta: { titulo: "Cuenta creada", tipo: "nuevo" },
  crear_abono: { titulo: "Abono registrado", tipo: "nuevo" },
  crear_abono_inicial: { titulo: "Abono inicial", tipo: "nuevo" },
  crear_saldo_favor_sobrepago: { titulo: "Excedente pasado a saldo a favor", tipo: "nuevo" },
  aplicar_saldo_a_favor: { titulo: "Pago con saldo a favor", tipo: "nuevo" },
  edicion_valor: { titulo: "Cambio del valor total", tipo: "cambio" },
  edicion_abono: { titulo: "Corrección de un abono", tipo: "cambio" },
  edicion_movimiento: { titulo: "Corrección de un movimiento", tipo: "cambio" },
  anulacion_movimiento: { titulo: "Abono anulado", tipo: "baja" },
  anular_abono_con_saldo: { titulo: "Abono anulado y su saldo a favor revertido", tipo: "baja" },
  eliminar_movimiento: { titulo: "Abono eliminado", tipo: "baja" },
  eliminar_cuenta: { titulo: "Cuenta eliminada", tipo: "baja" },
}

export type LineaAuditoria = {
  titulo: string
  /** "nuevo": solo importa el valor nuevo; "cambio": antes y despues; "baja": lo que se quito. */
  tipo: Accion["tipo"]
}

export function describirAccionAuditoria(accion: string | null | undefined): LineaAuditoria {
  const conocida = accion ? ACCIONES[accion] : undefined
  if (conocida) return conocida
  const texto = String(accion || "Cambio").replace(/_/g, " ").trim()
  return { titulo: texto.charAt(0).toUpperCase() + texto.slice(1), tipo: "cambio" }
}
