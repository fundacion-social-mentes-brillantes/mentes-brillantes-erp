// La API de Supabase devuelve como maximo 1000 filas por consulta (su "max
// rows"). Una lectura sin paginar de una tabla mas grande se corta SIN avisar:
// asi el respaldo completo traia 1000 de 2286 cuentas y 1000 de 1929 pagos.
//
// leerTodas pide pagina por pagina hasta que una viene incompleta. La consulta
// de cada pagina debe ir ORDENADA por algo unico (normalmente el id); sin orden
// fijo dos paginas pueden repetir o saltarse filas.

export const TAMANO_PAGINA = 1000

export type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

export async function leerTodas<T>(
  pedirPagina: (desde: number, hasta: number) => Pagina<T>,
  opciones: { tamano?: number; maximo?: number } = {}
): Promise<T[]> {
  const tamano = opciones.tamano ?? TAMANO_PAGINA
  const maximo = opciones.maximo ?? Number.POSITIVE_INFINITY
  const filas: T[] = []
  for (let desde = 0; desde < maximo; desde += tamano) {
    const hasta = Math.min(desde + tamano, maximo) - 1
    const { data, error } = await pedirPagina(desde, hasta)
    if (error) throw new Error(error.message)
    const lote = data || []
    filas.push(...lote)
    if (lote.length < hasta - desde + 1) break
  }
  return filas
}

/**
 * Igual que leerTodas, pero un fallo no lanza: vuelve como `error` junto a lo
 * que alcanzo a leer (nada). Sirve donde varias consultas se combinan y una
 * caida debe marcar el resultado como parcial en vez de tumbarlo todo.
 */
export async function leerTodasSinLanzar<T>(
  pedirPagina: (desde: number, hasta: number) => Pagina<T>,
  opciones: { tamano?: number; maximo?: number } = {}
): Promise<{ filas: T[]; error: { message: string } | null }> {
  try {
    return { filas: await leerTodas(pedirPagina, opciones), error: null }
  } catch (error) {
    return { filas: [], error: { message: error instanceof Error ? error.message : "Fallo la consulta" } }
  }
}
