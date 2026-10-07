/**
 * Turnos de consulta: cuando una pantalla lanza varias consultas seguidas
 * (alguien cambia filtros rapido), solo la ultima puede pintar resultados.
 *
 * Sin esto, en el Historial General la consulta de "todos los movimientos"
 * (2.000 filas, lenta) llegaba despues de la de una persona y la pisaba: el
 * filtro decia "Marcela" y la tabla mostraba a todo el mundo.
 */
export function crearTurnos() {
  let ultimo = 0
  return {
    /** Pide turno al empezar una consulta. */
    pedir: () => ++ultimo,
    /** true si ese turno sigue siendo el mas reciente. */
    vigente: (turno: number) => turno === ultimo,
  }
}
