import { describe, expect, it } from "vitest";
import {
  APARIENCIA_PREDETERMINADA,
  COLORES_SUGERIDOS,
  colores,
  contraste,
  leerApariencia,
  normalizarHex,
  resolverModo,
  variables,
} from "../apariencia";

const todos = [...COLORES_SUGERIDOS.map((c) => c.valor), "#ffff00", "#00ffff", "#ffffff", "#000000", "#ff00ff"];

describe("apariencia: cualquier color escogido se puede leer", () => {
  for (const modo of ["claro", "oscuro"] as const) {
    for (const acento of todos) {
      it(`${modo} con ${acento}`, () => {
        const c = colores(acento, modo);
        // Texto principal y secundario sobre los fondos donde aparecen.
        expect(contraste(c.tinta, c.fondo)).toBeGreaterThanOrEqual(7);
        expect(contraste(c.tinta, c.suave)).toBeGreaterThanOrEqual(7);
        expect(contraste(c.gris, c.panel)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(c.gris, c.suave)).toBeGreaterThanOrEqual(4.5);
        // El color principal como letra (enlaces) y la letra sobre el botón principal.
        expect(contraste(c.acento, c.panel)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(c.sobreAcento, c.acento)).toBeGreaterThanOrEqual(4.5);
        // La franja del Inicio y su texto.
        expect(contraste(c.sobreCampo, c.campo)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(c.sobreCampoSuave, c.campo)).toBeGreaterThanOrEqual(4.5);
        // Verde, rojo y ámbar (plata que entra, que sale y por cobrar) sobre el panel.
        for (const estado of [c.verde, c.rojo, c.ambar, c.info]) {
          expect(contraste(estado, c.panel)).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

describe("apariencia: variables y lectura de lo guardado", () => {
  it("las variables salen como tres números separados por comas", () => {
    const v = variables(APARIENCIA_PREDETERMINADA.acento, "claro");
    expect(v["--text-primary"]).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/);
    expect(v["--accent"]).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/);
    expect(v["--shadow-soft"]).toContain("rgba(");
  });

  it("normaliza colores escritos de varias formas", () => {
    expect(normalizarHex("#ABC")).toBe("#aabbcc");
    expect(normalizarHex("8f2453")).toBe("#8f2453");
    expect(normalizarHex("rojo")).toBeNull();
  });

  it("entiende lo que se guardaba antes (pink / dark)", () => {
    expect(leerApariencia(null, "dark")).toEqual({ modo: "oscuro", acento: APARIENCIA_PREDETERMINADA.acento });
    expect(leerApariencia(null, "pink")).toEqual({ modo: "claro", acento: APARIENCIA_PREDETERMINADA.acento });
    expect(leerApariencia({ modo: "oscuro", acento: "#123456" })).toEqual({ modo: "oscuro", acento: "#123456" });
    expect(leerApariencia({ modo: "raro", acento: "#123456" })).toBeNull();
    expect(leerApariencia(null, null)).toBeNull();
  });

  it("automático sigue al aparato", () => {
    expect(resolverModo("auto", true)).toBe("oscuro");
    expect(resolverModo("auto", false)).toBe("claro");
    expect(resolverModo("claro", true)).toBe("claro");
  });
});
