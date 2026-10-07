// Texto que escribe una persona y que va DENTRO de un filtro .or() de
// PostgREST ("concepto.ilike.%x%,notas.ilike.%x%"). Ahi la coma, los parentesis
// y el punto separan condiciones: una busqueda como "a,estado.eq.pagado"
// agregaba un filtro que nadie pidio. Se quitan esos caracteres (y los
// comodines, para que el % lo ponga el codigo y no quien busca).

export function textoParaFiltro(valor: unknown, maximo = 80): string {
  return String(valor ?? "")
    .replace(/[,()*\%_:."]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximo)
}
