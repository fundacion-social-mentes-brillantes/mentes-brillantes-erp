// Helpers de busqueda en tiempo real, insensibles a acentos y mayusculas.
// Compartidos por las paginas con buscador (Asistentes, Sesiones Coach) para
// que el filtrado se comporte exactamente igual en todas.

// Normaliza un texto: quita acentos/diacriticos, pasa a minuscula y recorta.
export function normalizarBusqueda(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// Devuelve true si la consulta aparece en alguno de los campos indicados.
// Una consulta vacia coincide con todo (no filtra).
export function coincideBusqueda(
  campos: Array<string | null | undefined>,
  consulta: string
): boolean {
  const q = normalizarBusqueda(consulta)
  if (!q) return true
  return campos.some((campo) => normalizarBusqueda(campo).includes(q))
}
