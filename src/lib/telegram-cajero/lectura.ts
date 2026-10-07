// Los datos de cada herramienta del bot llegan como unknown (el ejecutor los
// junta de muchas fuentes). Se leen con estos ayudantes en vez de `any`: si
// falta un campo, sale vacio en lugar de romper la respuesta.

export type Fila = Record<string, unknown>

/** El valor como objeto; cualquier otra cosa (null, lista, texto) da {}. */
export function objeto(valor: unknown): Fila {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Fila) : {}
}

/** El valor como lista de objetos; descarta lo que no sea objeto. */
export function filas(valor: unknown): Fila[] {
  return Array.isArray(valor) ? valor.filter((x): x is Fila => Boolean(x) && typeof x === "object") : []
}

/** El valor como lista de lo que sea. */
export function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : []
}

/** Texto o null: para campos que deben ser texto cuando existen. */
export function textoONulo(valor: unknown): string | null {
  return typeof valor === "string" && valor ? valor : null
}
