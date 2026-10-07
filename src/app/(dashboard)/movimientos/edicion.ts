import type { CambiosEdicionMovimiento } from './actions'

/** Lo que muestra el formulario de edicion; todo como texto, igual que los inputs. */
export type FormEdicion = {
  monto: string
  fecha: string
  concepto: string
  metodo_pago: string
  asistente_id: string
  notas: string
}

export const FORM_VACIO: FormEdicion = { monto: '', fecha: '', concepto: '', metodo_pago: '', asistente_id: '', notas: '' }

/**
 * Solo los campos que la persona cambio. Antes se mandaba el formulario entero
 * y eso traia dos problemas: un movimiento anulado (que la vista muestra en 0)
 * quedaba con monto 0 al editarle solo las notas, y en un abono el monto
 * siempre "venia" y la edicion se bloqueaba aunque no se tocara.
 */
export function camposCambiados(inicial: FormEdicion, actual: FormEdicion): CambiosEdicionMovimiento {
  const cambios: CambiosEdicionMovimiento = {}
  for (const campo of Object.keys(actual) as Array<keyof FormEdicion>) {
    if (actual[campo] !== inicial[campo]) cambios[campo] = actual[campo]
  }
  return cambios
}
