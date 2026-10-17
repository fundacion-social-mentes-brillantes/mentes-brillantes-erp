"use client";

import { useEffect, useId, useRef } from "react";
import { usePathname } from "next/navigation";
import { avanceDeCarga, llenadoDeBarras, textoDeCarga } from "@/lib/utils/carga";

// Barras del ícono de Finanzas GEMB (public/icons/icon-512.png), en sus mismas
// coordenadas de 512 x 512: cada una se va llenando de abajo hacia arriba con el
// porcentaje de carga.
const BARRAS = [
  { x: 194, arriba: 280 },
  { x: 256, arriba: 235 },
  { x: 318, arriba: 192 },
] as const;
const PISO = 350;
// Largo de cada barra: el trazo se dibuja de abajo hacia arriba y se recorre
// con stroke-dashoffset (no con pathLength, que Chrome no aplica a <line>).
const largo = (barra: (typeof BARRAS)[number]) => PISO - barra.arriba;

// Lo que se ve mientras llega una sección: el ícono de la app flotando, con sus
// barras llenándose, y el porcentaje debajo. Aparece con un leve retraso, así
// que en los cambios rápidos ni se alcanza a ver.
export function CargandoSeccion() {
  const texto = textoDeCarga(usePathname());
  const id = useId().replace(/:/g, "");
  const numero = useRef<HTMLSpanElement>(null);
  const rellenos = useRef<(SVGLineElement | null)[]>([]);

  useEffect(() => {
    const inicio = performance.now();
    let cuadro = 0;
    let mostrado = -1;
    const pintar = (ahora: number) => {
      const porcentaje = avanceDeCarga((ahora - inicio) / 1000);
      const entero = Math.floor(porcentaje);
      if (entero !== mostrado && numero.current) {
        numero.current.textContent = String(entero);
        mostrado = entero;
      }
      llenadoDeBarras(porcentaje).forEach((llenado, i) => {
        const barra = rellenos.current[i];
        if (!barra) return;
        barra.setAttribute("stroke-dashoffset", String(largo(BARRAS[i]) * (1 - llenado)));
        barra.style.opacity = llenado > 0.01 ? "1" : "0";
      });
      cuadro = requestAnimationFrame(pintar);
    };
    cuadro = requestAnimationFrame(pintar);
    return () => cancelAnimationFrame(cuadro);
  }, []);

  return (
    <div role="status" aria-live="polite" className="carga-seccion flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4">
      <div className="carga-seccion-icono relative h-28 w-28 md:h-32 md:w-32">
        <div aria-hidden className="carga-seccion-halo absolute -inset-6 rounded-full" />
        <svg viewBox="0 0 512 512" aria-hidden className="relative h-full w-full drop-shadow-[0_18px_28px_rgba(8,10,30,0.35)]">
          <defs>
            <radialGradient id={`${id}-naranja`} gradientUnits="userSpaceOnUse" cx="40" cy="470" r="250">
              <stop offset="0" stopColor="#ff7a2e" stopOpacity="0.9" />
              <stop offset="0.45" stopColor="#c2410c" stopOpacity="0.35" />
              <stop offset="1" stopColor="#c2410c" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${id}-azul`} gradientUnits="userSpaceOnUse" cx="490" cy="120" r="270">
              <stop offset="0" stopColor="#2b55ff" stopOpacity="0.9" />
              <stop offset="0.45" stopColor="#1d3fd6" stopOpacity="0.35" />
              <stop offset="1" stopColor="#1d3fd6" stopOpacity="0" />
            </radialGradient>
            {/* Área fija: una línea vertical mide 0 de ancho, y con un área relativa a ella
                el brillo (y la barra misma) no se dibujaría. */}
            <filter id={`${id}-brillo`} filterUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
              <feGaussianBlur stdDeviation="7" result="borroso" />
              <feMerge>
                <feMergeNode in="borroso" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id={`${id}-forma`}>
              <rect width="512" height="512" rx="118" />
            </clipPath>
          </defs>

          <g clipPath={`url(#${id}-forma)`}>
            <rect width="512" height="512" fill="#03050c" />
            <rect className="carga-seccion-luz-a" x="-128" y="-128" width="768" height="768" fill={`url(#${id}-naranja)`} />
            <rect className="carga-seccion-luz-b" x="-128" y="-128" width="768" height="768" fill={`url(#${id}-azul)`} />
          </g>

          <line x1="157" y1="381" x2="355" y2="381" stroke="rgba(255,255,255,0.45)" strokeWidth="5" strokeLinecap="round" />
          {BARRAS.map((barra) => (
            <line
              key={`fondo-${barra.x}`}
              x1={barra.x} y1={PISO} x2={barra.x} y2={barra.arriba}
              stroke="rgba(255,255,255,0.14)" strokeWidth="18" strokeLinecap="round"
            />
          ))}
          {BARRAS.map((barra, i) => (
            <line
              key={`relleno-${barra.x}`}
              ref={(el) => { rellenos.current[i] = el; }}
              x1={barra.x} y1={PISO} x2={barra.x} y2={barra.arriba}
              stroke="#ffffff" strokeWidth="18" strokeLinecap="round"
              strokeDasharray={`${largo(barra)} ${largo(barra)}`} strokeDashoffset={largo(barra)}
              filter={`url(#${id}-brillo)`}
              style={{ opacity: 0 }}
            />
          ))}
          <circle className="carga-seccion-punto" cx="318" cy="147" r="18" fill="#ffffff" filter={`url(#${id}-brillo)`} />
        </svg>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <p aria-hidden className="m-0 flex items-baseline gap-0.5 text-[rgb(var(--text-primary))]">
          <span ref={numero} className="text-4xl font-semibold tabular-nums tracking-tight">0</span>
          <span className="text-lg font-semibold text-[rgb(var(--gold))]">%</span>
        </p>
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.28em] text-[rgb(var(--text-muted))]">{texto}</p>
      </div>
    </div>
  );
}
