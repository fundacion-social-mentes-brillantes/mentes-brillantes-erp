import type { Json } from "@/types/database"

/**
 * Convierte un valor a JSON guardable en una columna jsonb. Pasa por
 * JSON.stringify a proposito: quita undefined y funciones, y si algo no se
 * puede serializar falla aqui y no a medias en la base.
 */
export function aJson(valor: unknown): Json {
  return JSON.parse(JSON.stringify(valor ?? null))
}

/** Un objeto JSON (no arreglo ni valor suelto). */
export function esObjetoJson(valor: Json | null | undefined): valor is { [clave: string]: Json | undefined } {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}
