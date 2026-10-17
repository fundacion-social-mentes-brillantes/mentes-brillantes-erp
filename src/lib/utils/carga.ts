// Cuentas de la pantalla de carga al cambiar de sección (CargandoSeccion).
// El servidor no avisa cuánto falta, así que el porcentaje es una estimación:
// sube rápido al principio y se frena antes de llegar al final, para no
// prometer un 100 % que todavía no ha llegado. Cuando la sección está lista,
// la pantalla de carga desaparece sola.

export const TOPE_DE_CARGA = 96;
const RITMO_SEGUNDOS = 0.85;

/** Porcentaje (0 a TOPE_DE_CARGA) que se muestra tras `segundos` de espera. */
export function avanceDeCarga(segundos: number): number {
  if (!(segundos > 0)) return 0;
  return TOPE_DE_CARGA * (1 - Math.exp(-segundos / RITMO_SEGUNDOS));
}

/**
 * Cuánto va llena (de 0 a 1) cada una de las tres barras del ícono: la primera
 * cubre del 0 al 33 %, la segunda del 33 al 66 % y la tercera el resto.
 */
export function llenadoDeBarras(porcentaje: number): [number, number, number] {
  const tramo = (desde: number, hasta: number) =>
    Math.min(1, Math.max(0, (porcentaje - desde) / (hasta - desde)));
  return [tramo(0, 33), tramo(33, 66), tramo(66, 100)];
}

const SECCIONES: Record<string, string> = {
  "": "el inicio",
  "asistente-ia": "el Asistente IA",
  movimientos: "Movimientos",
  asistentes: "Asistentes",
  cuentas: "Cuentas por cobrar",
  "sesiones-coach": "Sesiones coach",
  coach: "Coach",
  "ventas-externas": "Ventas externas",
  egresos: "Egresos",
  socios: "Socios y adelantos",
  liquidaciones: "Liquidaciones",
  "mi-estado": "Mi estado",
  configuracion: "Configuración",
  buscar: "la búsqueda",
};

/** Lo que dice debajo del ícono: «Abriendo Movimientos», o «Cargando» si la ruta no es conocida. */
export function textoDeCarga(ruta: string | null | undefined): string {
  const seccion = (ruta ?? "").split("?")[0].split("/").filter(Boolean)[0] ?? "";
  const nombre = SECCIONES[seccion];
  return nombre ? `Abriendo ${nombre}` : "Cargando";
}
