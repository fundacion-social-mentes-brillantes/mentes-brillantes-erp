import {
  ETIQUETA_ESTADO_PAGO,
  ETIQUETA_ESTADO_TALLER,
  EDAD_MAXIMA_NINO,
  ESTADOS_TALLER,
  kitLegible,
  type EstadoPagoTaller,
  type EstadoTaller,
} from '@/lib/operaciones/talleres-reglas'
import { pesos } from '@/lib/utils/pesos'

// Piezas pequenas que comparten la lista y la pagina de cada taller.

const CHIP = 'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold'

const COLOR_ESTADO_TALLER: Record<EstadoTaller, string> = {
  borrador: 'bg-suave-2 text-gris',
  abierto: 'bg-verde/12 text-verde',
  cerrado: 'bg-suave-2 text-tinta',
  realizado: 'bg-suave-2 text-tinta',
  cancelado: 'bg-rojo/12 text-rojo',
}

export function ChipEstadoTaller({ estado }: { estado: string }) {
  const clave = ESTADOS_TALLER.find((e) => e === estado) ?? 'borrador'
  return <span className={`${CHIP} ${COLOR_ESTADO_TALLER[clave]}`}>{ETIQUETA_ESTADO_TALLER[clave]}</span>
}

const COLOR_ESTADO_PAGO: Record<EstadoPagoTaller, string> = {
  al_dia: 'bg-verde/12 text-verde',
  abono: 'bg-ambar/12 text-ambar',
  debe: 'bg-ambar/12 text-ambar',
  sin_costo: 'bg-suave-2 text-gris',
}

export function ChipEstadoPago({ estado }: { estado: EstadoPagoTaller }) {
  return <span className={`${CHIP} ${COLOR_ESTADO_PAGO[estado]}`}>{ETIQUETA_ESTADO_PAGO[estado]}</span>
}

/** «Con kit» o «Sin kit», para verlo de un vistazo en la puerta. Sin dato no muestra nada. */
export function ChipKit({ kit }: { kit: boolean | null | undefined }) {
  if (kit === null || kit === undefined) return null
  return <span className={`${CHIP} ${kit ? 'bg-acento/12 text-acento' : 'bg-suave-2 text-gris'}`}>{kitLegible(kit)}</span>
}

/** Lo que pagan los niños (hasta 15 años) con kit y sin kit, cuando el taller cobra distinto. */
export type PreciosNinos = { conKit: number; sinKit: number }

/** "$ 120.000 · niños hasta 15 años: con kit $ 60.000, sin kit gratis" */
export function textoPrecios(precio: number, ninos: PreciosNinos | null | undefined): string {
  const valor = (v: number) => (v > 0 ? pesos(v) : 'gratis')
  const general = precio > 0 ? pesos(precio) : 'Gratis'
  return ninos
    ? `${general} · niños hasta ${EDAD_MAXIMA_NINO} años: con kit ${valor(ninos.conKit)}, sin kit ${valor(ninos.sinKit)}`
    : general
}

export const claseSelect =
  'flex h-10 w-full rounded-xl border border-linea bg-panel px-3 py-2 text-sm text-tinta hover:border-linea-fuerte focus-visible:border-acento focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-acento/40 disabled:cursor-not-allowed disabled:opacity-50 dark:[color-scheme:dark]'

export const claseArea =
  'flex min-h-24 w-full rounded-2xl border border-linea bg-panel px-3 py-2 text-sm text-tinta placeholder:text-gris hover:border-linea-fuerte focus-visible:border-acento focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-acento/40 disabled:cursor-not-allowed disabled:opacity-50'

export const claseEtiqueta = 'text-sm font-medium text-tinta'

