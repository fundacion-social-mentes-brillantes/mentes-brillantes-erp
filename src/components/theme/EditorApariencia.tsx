'use client';

import { useEffect, useId, useRef, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { APARIENCIA_PREDETERMINADA, COLORES_SUGERIDOS, normalizarHex, type ModoApariencia } from "@/lib/tema/apariencia";
import { useApariencia } from "./ThemeProvider";

const MODOS: { valor: ModoApariencia; nombre: string; icono: typeof Sun }[] = [
  { valor: "claro", nombre: "Claro", icono: Sun },
  { valor: "oscuro", nombre: "Oscuro", icono: Moon },
  { valor: "auto", nombre: "Como el aparato", icono: Monitor },
];

/** Modo (claro, oscuro o automático) y color principal. Se guarda en este navegador. */
export function EditorApariencia({ className }: { className?: string }) {
  const { apariencia, setModo, setAcento, restablecer } = useApariencia();
  const idOtro = useId();
  const acento = normalizarHex(apariencia.acento) ?? APARIENCIA_PREDETERMINADA.acento;
  const esSugerido = COLORES_SUGERIDOS.some((c) => c.valor === acento);

  return (
    <div className={cn("space-y-5", className)}>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-tinta">Modo</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-suave p-1">
          {MODOS.map(({ valor, nombre, icono: Icono }) => {
            const activo = apariencia.modo === valor;
            return (
              <button
                key={valor}
                type="button"
                aria-pressed={activo}
                onClick={() => setModo(valor)}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors",
                  activo ? "bg-panel text-tinta shadow-soft" : "text-gris hover:text-tinta"
                )}
              >
                <Icono className="h-4 w-4" aria-hidden />
                {nombre}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-tinta">Color principal</legend>
        <div className="grid grid-cols-4 gap-2">
          {COLORES_SUGERIDOS.map((c) => {
            const activo = c.valor === acento;
            return (
              <button
                key={c.valor}
                type="button"
                title={c.nombre}
                aria-label={c.nombre}
                aria-pressed={activo}
                onClick={() => setAcento(c.valor)}
                className={cn(
                  "grid h-11 place-items-center rounded-xl ring-offset-2 ring-offset-panel transition-shadow",
                  activo ? "ring-2 ring-tinta" : "hover:ring-2 hover:ring-linea-fuerte"
                )}
                style={{ backgroundColor: c.valor }}
              >
                {activo && <Check className="h-4 w-4 text-white" aria-hidden />}
              </button>
            );
          })}
        </div>
        <label htmlFor={idOtro} className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-linea px-3 py-2.5 text-sm font-medium text-tinta hover:bg-suave">
          <input
            id={idOtro}
            type="color"
            value={acento}
            onChange={(e) => setAcento(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded-md border-0 bg-transparent p-0"
          />
          {esSugerido ? "Escoger otro color" : `Otro color (${acento})`}
        </label>
        <p className="mt-2 text-xs leading-relaxed text-gris">
          El ERP ajusta solo los fondos, las letras y los botones para que todo se lea bien con el color que escojas.
        </p>
      </fieldset>

      <button type="button" onClick={restablecer} className="text-sm font-semibold text-acento hover:underline underline-offset-4">
        Volver a los colores de Mentes Brillantes
      </button>
    </div>
  );
}

/** Botón del encabezado que abre el editor de apariencia en un panel. */
export function BotonApariencia() {
  const { mounted } = useApariencia();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  if (!mounted) return <span className="h-10 w-10" aria-hidden />;

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label="Apariencia: modo y color"
        title="Apariencia"
        className="grid h-10 w-10 place-items-center rounded-xl text-gris transition-colors hover:bg-suave hover:text-tinta"
      >
        <Palette className="h-5 w-5" />
      </button>
      {abierto && (
        <div
          role="dialog"
          aria-label="Apariencia"
          className="fixed inset-x-3 top-16 z-50 rounded-2xl border border-linea bg-panel p-5 shadow-strong sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
        >
          <p className="mb-4 text-base font-semibold text-tinta">Apariencia</p>
          <EditorApariencia />
        </div>
      )}
    </div>
  );
}
