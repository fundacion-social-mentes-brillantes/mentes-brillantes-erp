---
version: alpha
name: Mostrador
description: El ERP como el mostrador de la fundación, donde se atiende a la persona primero y las cifras van después; colores con nombre que cambian solos con la apariencia que cada quien escoja.
colors:
  primary: "#8f2453"        # vino Mentes Brillantes: botón principal, enlaces, lo seleccionado y la franja del Inicio
  on-primary: "#ffffff"     # letra sobre el color principal
  surface: "#ffffff"        # panel: tarjetas, tablas, menú, encabezado
  background: "#f2ecef"     # fondo de la página (gris rosado, no crema)
  surface-soft: "#f9f4f6"   # suave: títulos de tabla, cajas internas, filas al pasar el mouse
  outline: "#ddced6"        # línea: bordes de tarjetas y separadores
  on-surface: "#2c151f"     # tinta: texto principal
  on-surface-muted: "#6b515e" # gris: texto secundario y rótulos (4,6:1 sobre suave)
  success: "#11764f"        # verde: solo dinero que entra y estado «pagado / activo»
  error: "#b3303f"          # rojo: solo dinero que sale, deudas vencidas y acciones de borrar
  warning: "#8b5b0e"        # ámbar: lo que falta por cobrar y «parcial»
  info: "#2e5f8f"           # azul: valor de una deuda en el historial
  gold: "#b88a2e"           # oro del logo: punto de las deudas recientes y el avatar en la franja
typography:
  page-title:
    fontFamily: Schibsted Grotesk
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.01em
  hero:
    fontFamily: Schibsted Grotesk
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.01em
  figure-lg:
    fontFamily: Schibsted Grotesk
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.0
  card-title:
    fontFamily: Schibsted Grotesk
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
  body-md:
    fontFamily: Schibsted Grotesk
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
  label-sm:
    fontFamily: Schibsted Grotesk
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: Schibsted Grotesk
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
rounded:
  sm: 6px
  md: 8px
  lg: 10px
  xl: 12px
  card: 16px
  full: 9999px
spacing:
  base: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.xl}"
    height: 40px
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    borderColor: "{colors.outline}"
---

# ERP Mentes Brillantes — Manual de estilo «Mostrador»

## Overview
El ERP es una herramienta de trabajo diario que usa sobre todo Sebastián, tanto en el celular
como en el computador, para cobrar, anotar sesiones coach y revisar las cifras del período.
La idea es el mostrador de la fundación: lo primero es atender a la persona («¿A quién vas a
atender?»), y las cifras del período van después. Es sobrio y denso cuando hace falta (tablas),
con un solo gesto propio: los paquetes coach se dibujan como **sellos**, uno lleno por sesión
tomada, igual que el carné de «Mi proceso». El color principal sale del logo (vino) y cada quien
puede cambiarlo en *Apariencia*; todo lo demás se calcula solo para que siempre se lea.

## Colors
- Los colores **nunca se escriben a mano** en una pantalla: se usan por su nombre
  (`bg-panel`, `text-tinta`, `text-gris`, `border-linea`, `bg-acento`, `text-verde`...). Así
  cambian solos con el modo claro/oscuro y con el color escogido.
- De dónde salen: `src/lib/tema/apariencia.ts` calcula todos los colores a partir de UNO
  (el principal) y del modo. Si un color no alcanza 4,5:1 sobre su fondo, se aclara u
  oscurece lo justo. Las pruebas (`src/lib/tema/__tests__`) lo verifican con colores extremos.
- Valores de entrada (vino `#8f2453`) en `src/app/globals.css`: claro en `:root`, oscuro en
  `:root[data-modo="oscuro"]`. Van como «r, g, b» para servir en `rgb(var(--x))` y en
  `rgba(var(--x), 0.5)`.
- Papeles fijos: verde = entra plata o está pagado; rojo = sale plata, vencido o borrar;
  ámbar = por cobrar o parcial. El color principal no se usa para estados.
- La **franja del Inicio** (`bg-campo`) es el color principal oscurecido hasta que el blanco
  se lea encima.

## Typography
- Una sola familia: **Schibsted Grotesk** (Google Fonts, licencia libre), servida desde el
  proyecto con `next/font`. Es una grotesca de periódico, directa y clara en cifras.
- Tamaño mínimo: 12 px, y solo para notas cortas. El texto normal va en 14 a 15 px.
- Nada de rótulos en MAYÚSCULAS ESPACIADAS.
- Montos con la clase `.cifra` (no se parten en dos renglones). **No** se usan cifras de
  ancho fijo (`tabular-nums`): en esta letra también ensanchan el punto de miles.

## Layout
- Computador: franja de íconos a la izquierda (104 px), encabezado de 64 px con el buscador,
  contenido con un ancho máximo de 1400 px y márgenes de 32 px.
- Celular: encabezado de una sola fila (menú, marca, buscar, avisos, apariencia) y barra de
  abajo con Inicio, Movimientos, Cuentas, Asistentes y «Más», que abre el menú completo desde abajo.
- Listas: en el computador van en tabla; en el celular, en una sola tarjeta con filas separadas
  por líneas (no una tarjeta por fila).

## Elevation & Depth
Plano. Las superficies se separan con borde (`border-linea`) y cambio de fondo
(`bg-suave`). La sombra (`shadow-strong`) es solo para lo que flota: menús desplegables,
ventanas y el panel de apariencia.

## Shapes
Tres radios: 8–12 px para campos y botones (`rounded-xl`), 16 px para tarjetas (`rounded-2xl`)
y redondo completo para etiquetas de estado. Bordes de 1 px.

## Components
- Botón principal: `bg-acento text-sobre-acento hover:bg-acento-fuerte`, alto 40 px, `rounded-xl`.
- Botón secundario: `border border-linea bg-panel text-tinta hover:bg-suave`.
- Botón sobre la franja del Inicio: el principal va blanco (`bg-sobre-campo text-campo`) y los
  demás translúcidos (`bg-white/10 border-white/25`).
- Etiqueta de estado: `rounded-full px-2.5 py-0.5 text-xs font-semibold bg-{color}/12 text-{color}`, sin borde.
- Campo: alto 40 px, `rounded-xl border border-linea bg-panel`, foco con el color principal.
- Tarjeta: `rounded-2xl border border-linea bg-panel`; su título en 16–18 px semibold, sin barritas de color.
- Sellos (`src/components/coach/Sellos.tsx`): un punto lleno por sesión tomada; con más de 40, barra.
- Buscador global (`src/components/layout/BuscadorGlobal.tsx`): «barra» en el encabezado,
  «grande» en el Inicio.

## Do's and Don'ts
- Do: usar los colores por nombre y probar cada pantalla en claro, oscuro y con otro color principal.
- Do: dejar los estados claros (vacío, cargando, error) con texto que diga qué pasa.
- Don't: degradados, brillos, luces de fondo, efecto vidrio, tarjetas que saltan al pasar el mouse.
- Don't: colores escritos a mano (`text-white` sobre un color, `bg-zinc-…`, `#hex`), salvo en los
  documentos que se exportan como imagen (marcados con `data-documento`, siempre en blanco).
- Don't: letra de menos de 12 px, mayúsculas espaciadas, letra de máquina fuera de código.

## Motion
Solo para dar respuesta: cambios de color de 150 ms, el menú del celular sube en 180 ms y el
cargador de secciones conserva el ícono de la app. Con «reducir movimiento» todo queda quieto.

## Voice
Español de Colombia, tuteo, frases cortas. Los botones dicen la acción («Registrar pago»,
«Cobrar $ 50.000», «+ Sesión»).

## Agent Prompt Guide
Antes de hacer una pantalla nueva: usa `bg-panel`/`bg-suave` para superficies, `text-tinta`/`text-gris`
para letras, `border-linea` para bordes y `bg-acento text-sobre-acento` para la acción principal.
Verde entra, rojo sale, ámbar por cobrar. Tarjetas `rounded-2xl`, campos y botones `rounded-xl` de
40 px. Una sola letra (Schibsted Grotesk), nada por debajo de 12 px, sin mayúsculas espaciadas.
Prohibido: degradados, brillos, vidrio, colores a mano y tarjetas dentro de tarjetas.
