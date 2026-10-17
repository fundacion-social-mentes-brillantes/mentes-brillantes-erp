import { describe, expect, it } from "vitest";
import { avanceDeCarga, llenadoDeBarras, textoDeCarga, TOPE_DE_CARGA } from "./carga";

describe("avanceDeCarga", () => {
  it("arranca en 0 y nunca pasa del tope, por larga que sea la espera", () => {
    expect(avanceDeCarga(0)).toBe(0);
    expect(avanceDeCarga(-1)).toBe(0);
    expect(avanceDeCarga(Number.NaN)).toBe(0);
    expect(avanceDeCarga(60)).toBeLessThanOrEqual(TOPE_DE_CARGA);
    expect(TOPE_DE_CARGA).toBeLessThan(100);
  });

  it("sube rápido al principio y se va frenando", () => {
    const a = avanceDeCarga(0.3);
    const b = avanceDeCarga(1);
    const c = avanceDeCarga(2);
    expect(a).toBeGreaterThan(20);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(b - a).toBeGreaterThan(c - b);
  });
});

describe("llenadoDeBarras", () => {
  it("llena las barras una tras otra", () => {
    expect(llenadoDeBarras(0)).toEqual([0, 0, 0]);
    expect(llenadoDeBarras(33)).toEqual([1, 0, 0]);
    expect(llenadoDeBarras(66)).toEqual([1, 1, 0]);
    expect(llenadoDeBarras(100)).toEqual([1, 1, 1]);
    const [primera, segunda, tercera] = llenadoDeBarras(49.5);
    expect(primera).toBe(1);
    expect(segunda).toBeCloseTo(0.5);
    expect(tercera).toBe(0);
  });
});

describe("textoDeCarga", () => {
  it("nombra la sección a la que se va", () => {
    expect(textoDeCarga("/movimientos")).toBe("Abriendo Movimientos");
    expect(textoDeCarga("/cuentas/123?pagina=2")).toBe("Abriendo Cuentas por cobrar");
    expect(textoDeCarga("/")).toBe("Abriendo el inicio");
  });

  it("dice solo «Cargando» si no conoce la ruta", () => {
    expect(textoDeCarga("/algo-nuevo")).toBe("Cargando");
    expect(textoDeCarga(null)).toBe("Abriendo el inicio");
  });
});
