import type { CSSProperties } from 'react'
import { pesos } from '@/lib/utils/pesos'
import {
  columnasProporcionales,
  diasDelPeriodo,
  fechaCorta,
  fechaEnPalabras,
  nitLegible,
  nombrePropio,
  notaCorta,
  partesDelPeriodo,
  rangoDelPeriodo,
} from '@/lib/utils/documento-liquidacion'

// El reporte de liquidacion que se descarga en PDF y en imagen (el mismo dibujo
// para los dos). Va con estilos en linea y colores fijos a proposito: html2canvas
// lo copia tal cual, y tiene que salir igual sin importar la apariencia (clara,
// oscura o de otro color) que tenga puesta quien lo descarga.
//
// Ancho fijo de 800 px y alto minimo de una hoja carta/A4 (1131 px), para que el
// PDF quepa en una sola pagina.

export type AdelantoDocumento = {
  fecha: string
  monto: number
  devuelto: number
  pendiente: number
  notas: string | null
  fechaDevolucion: string | null
}

export type SocioDocumento = {
  id: string
  nombre: string
  porcentaje: number
  corresponde: number
  adelantos: number
  neto: number
  detalle: AdelantoDocumento[]
}

export type DocumentoLiquidacionProps = {
  empresa: { nombre: string; nit: string }
  periodo: { nombre: string; estado: string; fecha_inicio: string; fecha_fin: string }
  financiero: {
    ingresos_cartera: number
    donaciones: number
    ventas_externas?: number
    ingresos_totales: number
    egresos: number
    utilidad: number
  }
  talleres?: { ingresos: number; salidas: number } | null
  socios: SocioDocumento[]
  generadoEl: string
  /** Alto minimo (el de una hoja para el PDF). La imagen no lo lleva: termina donde termina el contenido. */
  altoMinimo?: number
}

export const ANCHO_DOCUMENTO = 800
export const ALTO_HOJA = 1131

const C = {
  campo: '#671a3c', // vino oscuro de la franja del Inicio
  vino: '#8f2453',
  vinoClaro: '#f6eaf0',
  oro: '#d8b25a',
  rosa: '#ecd3df',
  tinta: '#2c151f',
  gris: '#6b515e',
  linea: '#e4d6dd',
  gasto: '#e9dfe4',
  verde: '#11764f',
  rojo: '#b3303f',
  ambar: '#8b5b0e',
}

const LETRA = 'var(--letra), "Schibsted Grotesk", system-ui, sans-serif'
const MARGEN = 56
const CONTENIDO = ANCHO_DOCUMENTO - MARGEN * 2
const SEPARACION = 4

export function DocumentoLiquidacion({ empresa, periodo, financiero, talleres, socios, generadoEl, altoMinimo }: DocumentoLiquidacionProps) {
  const rango = rangoDelPeriodo(periodo.fecha_inicio, periodo.fecha_fin)
  const dias = diasDelPeriodo(periodo.fecha_inicio, periodo.fecha_fin)
  const cerrada = periodo.estado === 'cerrado'
  const partes = partesDelPeriodo(financiero.ingresos_totales, financiero.egresos)
  const proporcional = financiero.utilidad > 0 && columnasProporcionales(socios.map((s) => s.porcentaje))
  const detalleEntro = [
    `Cobros ${pesos(financiero.ingresos_cartera)}`,
    financiero.donaciones > 0 ? `donaciones ${pesos(financiero.donaciones)}` : null,
    (financiero.ventas_externas ?? 0) > 0 ? `ventas ${pesos(financiero.ventas_externas)}` : null,
  ].filter(Boolean)
  const hayTalleres = !!talleres && (talleres.ingresos > 0.5 || talleres.salidas > 0.5)

  return (
    <div
      style={{
        width: ANCHO_DOCUMENTO,
        minHeight: altoMinimo,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        color: C.tinta,
        fontFamily: LETRA,
        fontKerning: 'normal',
      }}
    >
      {/* ── Franja: logo, a qué periodo corresponde y de qué fecha a qué fecha ── */}
      <div style={{ backgroundColor: C.campo, padding: `32px ${MARGEN}px 30px`, display: 'flex', alignItems: 'flex-start', gap: 36 }}>
        {/* <img> a proposito: html2canvas la copia tal cual; next/image no sirve aqui. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-documento.png" alt="Gimnasio Emocional Mentes Brillantes" width={196} height={122} style={{ display: 'block', width: 196, height: 122, marginTop: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: '20px', fontWeight: 500, color: C.rosa }}>Liquidación de socios</p>
          <p style={{ margin: '3px 0 0', fontSize: 17, lineHeight: '22px', fontWeight: 600, color: C.oro }}>{periodo.nombre}</p>
          <p style={{ margin: '16px 0 0', fontSize: 35, lineHeight: '39px', fontWeight: 600, letterSpacing: '-0.015em', color: '#ffffff' }}>
            <span style={{ display: 'block' }}>{rango.desde}</span>
            <span style={{ display: 'block' }}>{rango.hasta}</span>
            {rango.anio && <span style={{ display: 'block' }}>{rango.anio}</span>}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 26,
                padding: '0 12px',
                borderRadius: 999,
                border: `1px solid ${cerrada ? C.oro : C.rosa}`,
                color: cerrada ? C.oro : C.rosa,
                fontSize: 13,
                lineHeight: '24px',
                fontWeight: 600,
              }}
            >
              {cerrada ? 'Cerrada' : 'Abierta: es una proyección'}
            </div>
            {dias && <span style={{ fontSize: 14, lineHeight: '24px', color: C.rosa }}>{dias} días</span>}
          </div>
        </div>
      </div>

      <div style={{ padding: `28px ${MARGEN}px 0`, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* ── La cuenta del periodo: entró − salió = quedó ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <Cifra titulo="Entró" valor={financiero.ingresos_totales} detalle={detalleEntro.join(' + ')} />
          <Signo>−</Signo>
          <Cifra titulo="Salió en gastos" valor={financiero.egresos} detalle="lo que se pagó en el periodo" />
          <Signo>=</Signo>
          <Cifra
            titulo={financiero.utilidad >= 0 ? 'Quedó para repartir' : 'Faltó'}
            valor={financiero.utilidad}
            destacada
            detalle={
              financiero.utilidad > 0
                ? `entre ${socios.length} ${socios.length === 1 ? 'socio' : 'socios'}`
                : 'no hay utilidad para repartir'
            }
          />
        </div>

        {/* La barra: todo lo que entró; el pedazo vino es lo que quedó. */}
        <div style={{ marginTop: 24, display: 'flex', height: 14, gap: SEPARACION }}>
          {partes.gastos > 0 && <div style={{ flex: partes.gastos, backgroundColor: C.gasto, borderRadius: 3 }} />}
          {partes.queda > 0 && <div style={{ flex: partes.queda, backgroundColor: C.vino, borderRadius: 3 }} />}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 8, fontSize: 13 }}>
          <span style={{ color: C.gris }}>{partes.gastos > 0 ? `${partes.gastos} % se fue en gastos` : 'No hubo gastos'}</span>
          {partes.queda > 0 && <span style={{ color: C.vino, fontWeight: 600 }}>{partes.queda} % quedó</span>}
        </div>

        {financiero.utilidad > 0 && socios.length > 0 && (
          <>
            {/* Lo que quedó se abre a todo el ancho y se parte en el porcentaje de cada socio. */}
            <Embudo desde={partes.gastos / 100} />
            <div style={{ display: 'flex', gap: SEPARACION }}>
              {socios.map((s) => (
                <div
                  key={s.id}
                  style={{
                    flex: proporcional ? s.porcentaje : 1,
                    backgroundColor: C.vino,
                    color: '#ffffff',
                    borderRadius: 3,
                    padding: '8px 14px 9px',
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  {s.porcentaje} %
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Cada socio: le toca − adelantos = recibe ── */}
        <div style={{ display: 'flex', gap: SEPARACION, marginTop: financiero.utilidad > 0 ? 0 : 32, flexWrap: proporcional ? 'nowrap' : 'wrap' }}>
          {socios.map((s, i) => (
            <ColumnaSocio
              key={s.id}
              socio={s}
              flex={proporcional ? s.porcentaje : undefined}
              ancho={proporcional ? undefined : socios.length <= 3 ? (CONTENIDO - SEPARACION * (socios.length - 1)) / socios.length : (CONTENIDO - SEPARACION) / 2}
              conLinea={i > 0 && (proporcional || socios.length <= 3)}
            />
          ))}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          {hayTalleres && talleres && (
            <p style={{ margin: 0, padding: '12px 0', borderTop: `1px solid ${C.linea}`, fontSize: 13, lineHeight: 1.5, color: C.gris }}>
              <span style={{ color: C.tinta, fontWeight: 600 }}>Los talleres van aparte, con su propia nómina.</span> En este
              periodo entraron {pesos(talleres.ingresos)} y salieron {pesos(talleres.salidas)} por talleres; esa plata no
              está en esta liquidación.
            </p>
          )}
          <div
            style={{
              padding: '12px 0 22px',
              borderTop: `1px solid ${C.linea}`,
              fontSize: 12,
              lineHeight: 1.45,
              color: C.gris,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <span>
              {empresa.nombre}
              <br />
              NIT {nitLegible(empresa.nit)}
            </span>
            <span style={{ textAlign: 'right' }}>
              Generado el {fechaEnPalabras(generadoEl)}
              <br />
              Documento informativo
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Cifra({ titulo, valor, detalle, destacada = false }: { titulo: string; valor: number; detalle?: string; destacada?: boolean }) {
  return (
    <div style={{ flex: destacada ? 1.25 : 1, minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: destacada ? 600 : 500, color: destacada ? C.vino : C.gris }}>{titulo}</p>
      <p
        style={{
          margin: '6px 0 0',
          fontSize: destacada ? 34 : 26,
          lineHeight: 1.05,
          fontWeight: destacada ? 700 : 600,
          letterSpacing: '-0.01em',
          color: destacada ? (valor < 0 ? C.rojo : C.vino) : C.tinta,
          whiteSpace: 'nowrap',
        }}
      >
        {pesos(valor)}
      </p>
      {detalle && <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.4, color: C.gris }}>{detalle}</p>}
    </div>
  )
}

function Signo({ children }: { children: string }) {
  return (
    <div style={{ width: 34, textAlign: 'center', paddingTop: 22, fontSize: 26, fontWeight: 400, color: C.gris }}>{children}</div>
  )
}

/** El trapecio que lleva el pedazo «quedó» de la barra al ancho completo. */
function Embudo({ desde }: { desde: number }) {
  const alto = 34
  const x = Math.min(CONTENIDO, Math.max(0, desde * CONTENIDO + (desde > 0 ? SEPARACION / 2 : 0)))
  return (
    <svg width={CONTENIDO} height={alto} viewBox={`0 0 ${CONTENIDO} ${alto}`} style={{ display: 'block', marginTop: 2 }} aria-hidden>
      <polygon points={`${x},0 ${CONTENIDO},0 ${CONTENIDO},${alto} 0,${alto}`} fill={C.vinoClaro} />
    </svg>
  )
}

function ColumnaSocio({
  socio,
  flex,
  ancho,
  conLinea,
}: {
  socio: SocioDocumento
  flex?: number
  ancho?: number
  conLinea: boolean
}) {
  const debe = socio.neto < -0.5
  const estilo: CSSProperties = {
    flex: flex ?? undefined,
    width: ancho,
    minWidth: 0,
    padding: '16px 14px 0',
    borderLeft: conLinea ? `1px solid ${C.linea}` : '1px solid transparent',
  }
  return (
    <div style={estilo}>
      <p style={{ margin: 0, fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>{nombrePropio(socio.nombre)}</p>

      <Renglon titulo={`Le toca`} valor={pesos(socio.corresponde)} />
      <Renglon titulo="Adelantos" valor={socio.adelantos > 0.5 ? `− ${pesos(socio.adelantos)}` : pesos(0)} tenue={socio.adelantos <= 0.5} />

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.linea}` }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: debe ? C.rojo : C.vino }}>
          {debe ? 'Debe devolver' : 'Recibe'}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 30, lineHeight: 1.1, fontWeight: 700, letterSpacing: '-0.01em', color: debe ? C.rojo : C.vino, whiteSpace: 'nowrap' }}>
          {pesos(Math.abs(socio.neto))}
        </p>
      </div>

      <div style={{ marginTop: 16 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: C.gris }}>
          {socio.detalle.length ? 'Sus adelantos' : 'Sin adelantos en este periodo'}
        </p>
        {socio.detalle.map((a, i) => {
          const nota = notaCorta(a.notas)
          const devueltoTodo = a.pendiente <= 0.5 && a.devuelto > 0
          return (
            <div key={`${a.fecha}-${i}`} style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <span style={{ color: C.gris }}>{fechaCorta(a.fecha)}</span>
                <span style={{ fontWeight: 600, color: devueltoTodo ? C.gris : C.tinta, whiteSpace: 'nowrap', textDecoration: devueltoTodo ? 'line-through' : 'none' }}>
                  {pesos(devueltoTodo ? a.monto : a.pendiente)}
                </span>
              </div>
              {nota && <p style={{ margin: '1px 0 0', fontSize: 12, lineHeight: 1.35, color: C.gris }}>{nota}</p>}
              {a.devuelto > 0 && (
                <p style={{ margin: '1px 0 0', fontSize: 12, lineHeight: 1.35, color: C.verde }}>
                  {devueltoTodo
                    ? `Lo devolvió${a.fechaDevolucion ? ` el ${fechaCorta(a.fechaDevolucion)}` : ''}: no se descuenta`
                    : `De ${pesos(a.monto)} devolvió ${pesos(a.devuelto)}`}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Renglon({ titulo, valor, tenue = false }: { titulo: string; valor: string; tenue?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 9, fontSize: 15 }}>
      <span style={{ color: C.gris }}>{titulo}</span>
      <span style={{ fontWeight: 600, color: tenue ? C.gris : C.tinta, whiteSpace: 'nowrap' }}>{valor}</span>
    </div>
  )
}
