// Apariencia del ERP: modo (claro, oscuro o el del aparato) y un color principal.
// De ese color se calculan todos los demás (fondos, bordes, letras, botones y la
// franja del Inicio), cuidando que el texto siempre se pueda leer: si un color no
// alcanza el contraste mínimo sobre su fondo, se aclara u oscurece lo justo.
// Es la misma idea de la Agenda (agenda-mentes-brillantes/src/lib/tema.ts).

export type ModoApariencia = "claro" | "oscuro" | "auto";
export type ModoResuelto = "claro" | "oscuro";

export interface Apariencia {
  modo: ModoApariencia;
  /** Color principal, en hexadecimal (#rrggbb). */
  acento: string;
}

/** Vino rosado del Gimnasio Emocional Mentes Brillantes: el color de entrada. */
export const ACENTO_MENTES_BRILLANTES = "#8f2453";

export const APARIENCIA_PREDETERMINADA: Apariencia = { modo: "auto", acento: ACENTO_MENTES_BRILLANTES };

export const CLAVE_APARIENCIA = "mb-apariencia";
/** Variables ya calculadas, para pintarlas antes de que cargue la página (sin destello). */
export const CLAVE_VARIABLES = "mb-apariencia-variables";
/** Formato anterior: "pink" o "dark". */
export const CLAVE_TEMA_VIEJO = "mb-theme";

/** Colores para escoger con un toque (el selector permite cualquier otro). */
export const COLORES_SUGERIDOS: { valor: string; nombre: string }[] = [
  { valor: ACENTO_MENTES_BRILLANTES, nombre: "Vino Mentes Brillantes" },
  { valor: "#c2366f", nombre: "Rosa" },
  { valor: "#5b2dff", nombre: "Violeta Agenda" },
  { valor: "#1f6fd1", nombre: "Azul" },
  { valor: "#0f8a7a", nombre: "Verde azulado" },
  { valor: "#b8541f", nombre: "Terracota" },
  { valor: "#9a7424", nombre: "Dorado" },
  { valor: "#3d4a5c", nombre: "Pizarra" },
];

type Rgb = [number, number, number];

/** "#abc" o "#aabbcc" (con o sin #) -> "#aabbcc". Lo demás -> null. */
export function normalizarHex(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(limpio)) return `#${limpio.split("").map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{6}$/.test(limpio)) return `#${limpio}`;
  return null;
}

function aRgb(hex: string): Rgb {
  const h = normalizarHex(hex) ?? "#000000";
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function aHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Mezcla dos colores: t = 0 deja el primero, t = 1 da el segundo. */
export function mezclar(a: string, b: string, t: number): string {
  const x = aRgb(a);
  const y = aRgb(b);
  return aHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

function luminancia(hex: string): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = aRgb(hex);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Contraste entre dos colores (1 a 21). Para leer texto normal hace falta 4.5. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Aclara (u oscurece) el color lo justo para que se lea sobre el fondo. */
export function legibleSobre(color: string, fondo: string, minimo = 4.5): string {
  if (contraste(color, fondo) >= minimo) return color;
  const hacia = luminancia(fondo) > 0.18 ? "#000000" : "#ffffff";
  for (let t = 0.04; t <= 1; t += 0.04) {
    const candidato = mezclar(color, hacia, t);
    if (contraste(candidato, fondo) >= minimo) return candidato;
  }
  return hacia;
}

/** Oscurece un color hasta que el blanco se lea encima. */
function fondoParaBlanco(color: string, minimo = 4.6): string {
  return legibleSobre(color, "#ffffff", minimo);
}

/** "#aabbcc" -> "170, 187, 204": así sirve igual en rgb(var(--x)) y en rgba(var(--x), 0.5). */
function trio(hex: string): string {
  return aRgb(hex).join(", ");
}

export function resolverModo(modo: ModoApariencia, sistemaOscuro: boolean): ModoResuelto {
  if (modo === "claro") return "claro";
  if (modo === "oscuro") return "oscuro";
  return sistemaOscuro ? "oscuro" : "claro";
}

/** Los colores con nombre de una apariencia ya resuelta (en hexadecimal). */
export function colores(acentoCrudo: string, modo: ModoResuelto) {
  const acento = normalizarHex(acentoCrudo) ?? ACENTO_MENTES_BRILLANTES;

  if (modo === "oscuro") {
    const fondo = mezclar("#121013", acento, 0.05);
    const panel = mezclar("#1b181b", acento, 0.07);
    const suave = mezclar("#231f23", acento, 0.09);
    const suave2 = mezclar("#2c272c", acento, 0.11);
    const linea = mezclar("#3a3439", acento, 0.14);
    const tinta = "#f4eef1";
    const gris = legibleSobre(mezclar("#b9adb4", acento, 0.08), suave, 4.6);
    // El botón principal en oscuro va claro, con la letra oscura encima.
    const acentoClaro = legibleSobre(mezclar(acento, "#ffffff", 0.3), panel, 5);
    const sobreAcento = contraste("#ffffff", acentoClaro) >= 4.5 ? "#ffffff" : mezclar("#120a0e", acento, 0.2);
    const campo = fondoParaBlanco(mezclar(acento, "#000000", 0.28), 5);
    return {
      fondo, panel, suave, suave2, linea,
      lineaFuerte: mezclar(linea, tinta, 0.2),
      tinta, gris,
      acento: acentoClaro,
      acentoFuerte: mezclar(acentoClaro, "#ffffff", 0.18),
      sobreAcento,
      campo,
      sobreCampo: "#ffffff",
      sobreCampoSuave: legibleSobre(mezclar("#ffffff", campo, 0.25), campo, 4.6),
      verde: legibleSobre("#4cc38a", panel, 4.5),
      rojo: legibleSobre("#ff7b8a", panel, 4.5),
      rojoFuerte: "#ff5c6f",
      ambar: legibleSobre("#e5b45a", panel, 4.5),
      info: legibleSobre("#7fb6e6", panel, 4.5),
      oro: "#d6ad55",
      sombra: "0 1px 2px rgba(0, 0, 0, 0.35), 0 6px 18px rgba(0, 0, 0, 0.28)",
      sombraFuerte: "0 18px 44px rgba(0, 0, 0, 0.55)",
    };
  }

  const fondo = mezclar("#f6f4f5", acento, 0.04);
  const panel = "#ffffff";
  const suave = mezclar("#ffffff", acento, 0.05);
  const suave2 = mezclar("#ffffff", acento, 0.1);
  const linea = mezclar("#e6e1e4", acento, 0.1);
  const tinta = legibleSobre(mezclar("#1e1318", acento, 0.12), fondo, 12);
  const gris = legibleSobre(legibleSobre(mezclar("#665760", acento, 0.12), suave, 4.6), fondo, 4.6);
  const acentoTexto = legibleSobre(legibleSobre(acento, suave, 4.6), fondo, 4.6);
  const sobreAcento = contraste("#ffffff", acentoTexto) >= 4.5 ? "#ffffff" : tinta;
  const campo = fondoParaBlanco(acento, 4.6);
  return {
    fondo, panel, suave, suave2, linea,
    lineaFuerte: mezclar(linea, tinta, 0.18),
    tinta, gris,
    acento: acentoTexto,
    acentoFuerte: mezclar(acentoTexto, "#000000", 0.16),
    sobreAcento,
    campo,
    sobreCampo: "#ffffff",
    sobreCampoSuave: legibleSobre(mezclar("#ffffff", campo, 0.2), campo, 4.6),
    verde: legibleSobre("#11764f", suave, 4.6),
    rojo: legibleSobre("#b3303f", suave, 4.6),
    rojoFuerte: "#962634",
    ambar: legibleSobre("#8b5b0e", suave, 4.6),
    info: legibleSobre("#2e5f8f", suave, 4.6),
    oro: "#b88a2e",
    sombra: "0 1px 2px rgba(40, 18, 30, 0.06), 0 4px 14px rgba(40, 18, 30, 0.05)",
    sombraFuerte: "0 16px 40px rgba(40, 18, 30, 0.16)",
  };
}

/**
 * Las variables CSS de una apariencia ya resuelta. Los nombres son los de siempre
 * (--bg, --text-primary...) para que las clases rgb(var(--x)) y rgba(var(--x), a)
 * del código existente tomen el color nuevo sin cambiar nada más.
 */
export function variables(acento: string, modo: ModoResuelto): Record<string, string> {
  const c = colores(acento, modo);
  return {
    "--bg": trio(c.fondo),
    "--surface-1": trio(c.panel),
    "--surface-2": trio(c.suave),
    "--surface-3": trio(c.suave2),
    "--muted-surface": trio(c.suave),
    "--border": trio(c.linea),
    "--border-strong": trio(c.lineaFuerte),
    "--text-primary": trio(c.tinta),
    "--text-muted": trio(c.gris),
    "--accent": trio(c.acento),
    "--accent-strong": trio(c.acentoFuerte),
    "--accent-foreground": trio(c.sobreAcento),
    "--ring-color": trio(c.acento),
    "--campo": trio(c.campo),
    "--on-campo": trio(c.sobreCampo),
    "--on-campo-muted": trio(c.sobreCampoSuave),
    "--success": trio(c.verde),
    "--danger": trio(c.rojo),
    "--danger-strong": trio(c.rojoFuerte),
    "--warning": trio(c.ambar),
    "--info": trio(c.info),
    "--gold": trio(c.oro),
    "--input-bg": trio(c.panel),
    "--shadow-soft": c.sombra,
    "--shadow-strong": c.sombraFuerte,
  };
}

/** Lee la apariencia guardada sin confiar en su forma; entiende el formato viejo ("pink" / "dark"). */
export function leerApariencia(crudo: unknown, temaViejo?: unknown): Apariencia | null {
  if (crudo && typeof crudo === "object") {
    const fuente = crudo as Record<string, unknown>;
    const acento = normalizarHex(fuente.acento);
    const modo = fuente.modo === "claro" || fuente.modo === "oscuro" || fuente.modo === "auto" ? fuente.modo : null;
    if (acento && modo) return { modo, acento };
  }
  if (temaViejo === "dark") return { modo: "oscuro", acento: ACENTO_MENTES_BRILLANTES };
  if (temaViejo === "pink" || temaViejo === "light") return { modo: "claro", acento: ACENTO_MENTES_BRILLANTES };
  return null;
}
