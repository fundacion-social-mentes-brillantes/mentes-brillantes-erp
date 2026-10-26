'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useEstaMontado } from "@/lib/hooks/use-esta-montado";
import {
  APARIENCIA_PREDETERMINADA,
  CLAVE_APARIENCIA,
  CLAVE_TEMA_VIEJO,
  CLAVE_VARIABLES,
  leerApariencia,
  normalizarHex,
  resolverModo,
  variables,
  type Apariencia,
  type ModoApariencia,
  type ModoResuelto,
} from "@/lib/tema/apariencia";

interface AparienciaContexto {
  apariencia: Apariencia;
  /** Claro u oscuro, ya resuelto (el automático sigue al aparato). */
  modo: ModoResuelto;
  setModo: (modo: ModoApariencia) => void;
  setAcento: (acento: string) => void;
  restablecer: () => void;
  mounted: boolean;
}

const Contexto = createContext<AparienciaContexto | undefined>(undefined);

/**
 * Se ejecuta en <head>, antes de pintar: pone el modo y los colores guardados para
 * que la página no aparezca un instante con otros colores (el "destello").
 * Va como texto porque corre antes de React; no puede importar nada.
 */
export const SCRIPT_APARIENCIA = `(function(){try{
var d=document.documentElement,a=null,v=null;
try{a=JSON.parse(localStorage.getItem(${JSON.stringify(CLAVE_APARIENCIA)})||"null")}catch(e){}
if(!a){var t=localStorage.getItem(${JSON.stringify(CLAVE_TEMA_VIEJO)});if(t==="dark")a={modo:"oscuro"};else if(t==="pink"||t==="light")a={modo:"claro"}}
var m=a&&a.modo==="oscuro"?"oscuro":a&&a.modo==="claro"?"claro":(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"oscuro":"claro");
d.setAttribute("data-modo",m);
try{v=JSON.parse(localStorage.getItem(${JSON.stringify(CLAVE_VARIABLES)})||"null")}catch(e){}
if(v&&a&&v.acento===a.acento&&v[m]){for(var k in v[m])d.style.setProperty(k,v[m][k])}
}catch(e){}})();`;

function sistemaOscuro() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function aplicar(apariencia: Apariencia, modo: ModoResuelto) {
  if (typeof document === "undefined") return;
  const raiz = document.documentElement;
  raiz.setAttribute("data-modo", modo);
  const predeterminado = normalizarHex(apariencia.acento) === APARIENCIA_PREDETERMINADA.acento;
  const vars = variables(apariencia.acento, modo);
  for (const [k, v] of Object.entries(vars)) {
    // Con el color de entrada mandan los valores del CSS; con otro color, los calculados.
    if (predeterminado) raiz.style.removeProperty(k);
    else raiz.style.setProperty(k, v);
  }
  try {
    localStorage.setItem(CLAVE_APARIENCIA, JSON.stringify(apariencia));
    localStorage.removeItem(CLAVE_TEMA_VIEJO);
    if (predeterminado) localStorage.removeItem(CLAVE_VARIABLES);
    else
      localStorage.setItem(
        CLAVE_VARIABLES,
        JSON.stringify({ acento: apariencia.acento, claro: variables(apariencia.acento, "claro"), oscuro: variables(apariencia.acento, "oscuro") })
      );
  } catch {
    // sin almacenamiento (modo privado): igual se ve bien mientras la pestaña esté abierta
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [apariencia, setApariencia] = useState<Apariencia>(APARIENCIA_PREDETERMINADA);
  const [oscuroDelAparato, setOscuroDelAparato] = useState(false);
  const mounted = useEstaMontado();

  useEffect(() => {
    let guardada: Apariencia | null = null;
    try {
      guardada = leerApariencia(JSON.parse(localStorage.getItem(CLAVE_APARIENCIA) || "null"), localStorage.getItem(CLAVE_TEMA_VIEJO));
    } catch {
      guardada = null;
    }
    // Lo guardado solo existe en el navegador: se lee despues de hidratar para que
    // el HTML del servidor y el primer render coincidan.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (guardada) setApariencia(guardada);
    setOscuroDelAparato(sistemaOscuro());
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const cambio = (e: MediaQueryListEvent) => setOscuroDelAparato(e.matches);
    media?.addEventListener("change", cambio);
    return () => media?.removeEventListener("change", cambio);
  }, []);

  const modo = resolverModo(apariencia.modo, oscuroDelAparato);

  useEffect(() => {
    if (mounted) aplicar(apariencia, modo);
  }, [apariencia, modo, mounted]);

  const setModo = useCallback((m: ModoApariencia) => setApariencia((a) => ({ ...a, modo: m })), []);
  const setAcento = useCallback((acento: string) => {
    const limpio = normalizarHex(acento);
    if (limpio) setApariencia((a) => ({ ...a, acento: limpio }));
  }, []);
  const restablecer = useCallback(() => setApariencia(APARIENCIA_PREDETERMINADA), []);

  const valor = useMemo(
    () => ({ apariencia, modo, setModo, setAcento, restablecer, mounted }),
    [apariencia, modo, setModo, setAcento, restablecer, mounted]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useApariencia() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useApariencia debe usarse dentro de ThemeProvider");
  return ctx;
}
