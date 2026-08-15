'use client'

import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { ImageDown } from 'lucide-react'

// Imagen para mandarle al socio cuando pregunta "¿yo cuánto debo?".
//
// Va con estilos en línea a propósito: los temas Oscuro y Rosa reescriben las
// clases de color con !important, y la imagen tiene que salir siempre legible,
// no del color del tema que tenga puesto quien la descarga.

export type MovimientoImagen = { fecha: string; monto: number; metodo: string; notas: string | null }
export type AdelantoImagen = MovimientoImagen & {
  devuelto: number
  pendiente: number
  devoluciones: MovimientoImagen[]
}
export type SocioImagen = {
  socioId: string
  nombre: string
  entregado: number
  devuelto: number
  pendiente: number
  adelantos: AdelantoImagen[]
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`

/** dd/mm/aaaa sin pasar por Date: 'YYYY-MM-DD' en UTC se corre un día. */
function fechaCorta(iso: string): string {
  const [y, m, d] = String(iso || '').split('-')
  return y && m && d ? `${d}/${m}/${y}` : String(iso || '')
}

export function ImagenAdelantosSocio({
  socios,
  empresa,
  periodo,
}: {
  socios: SocioImagen[]
  empresa: { nombre: string; nit: string }
  periodo: { nombre: string; fecha_inicio: string; fecha_fin: string }
}) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({})
  const [generando, setGenerando] = useState<string | null>(null)

  const descargar = async (socio: SocioImagen) => {
    const nodo = refs.current[socio.socioId]
    if (!nodo) return
    try {
      setGenerando(socio.socioId)
      const canvas = await html2canvas(nodo, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' })
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = `Adelantos_${socio.nombre.replace(/\s+/g, '_')}_${periodo.nombre.replace(/\s+/g, '_')}.png`
      link.click()
    } catch (error) {
      console.error('Error al generar la imagen de adelantos:', error)
      alert(`No se pudo generar la imagen: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setGenerando(null)
    }
  }

  if (!socios.length) return null

  return (
    <>
      <div className="divide-y divide-zinc-100">
        {socios.map((socio) => (
          <div key={socio.socioId} className="p-4">
            <div className="flex justify-between items-start mb-1">
              <p className="font-medium text-zinc-900 text-sm">{socio.nombre}</p>
              <p className={`font-semibold text-sm ${socio.pendiente > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {socio.pendiente > 0 ? `Debe ${pesos(socio.pendiente)}` : 'Al día'}
              </p>
            </div>
            <p className="text-xs text-zinc-500">
              Se le adelantó {pesos(socio.entregado)} en {socio.adelantos.length} movimiento(s) · ha devuelto{' '}
              {pesos(socio.devuelto)}
            </p>
            <button
              type="button"
              onClick={() => descargar(socio)}
              disabled={generando === socio.socioId}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
            >
              <ImageDown className="w-4 h-4" />
              {generando === socio.socioId ? 'Generando...' : 'Descargar imagen para enviarle'}
            </button>
          </div>
        ))}
      </div>

      {/* Lo que se convierte en imagen. Fuera de pantalla, nunca se ve en la app. */}
      <div className="absolute -left-[9999px] top-0" aria-hidden>
        {socios.map((socio) => (
          <div
            key={socio.socioId}
            ref={(el) => {
              refs.current[socio.socioId] = el
            }}
            style={{
              width: '760px',
              padding: '40px',
              backgroundColor: '#ffffff',
              color: '#111827',
              fontFamily: 'sans-serif',
            }}
          >
            <div style={{ borderBottom: '2px solid #374151', paddingBottom: '16px', marginBottom: '24px' }}>
              <p style={{ margin: 0, fontSize: '13px', letterSpacing: '2px', color: '#6b7280', textTransform: 'uppercase' }}>
                {empresa.nombre}
              </p>
              <h1 style={{ margin: '6px 0 0 0', fontSize: '28px', fontWeight: 800 }}>Adelantos de {socio.nombre}</h1>
              <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#4b5563' }}>
                {periodo.nombre} · del {fechaCorta(periodo.fecha_inicio)} al {fechaCorta(periodo.fecha_fin)}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
              <Cifra titulo="Se le adelantó" valor={pesos(socio.entregado)} color="#b45309" fondo="#fffbeb" />
              <Cifra titulo="Ha devuelto" valor={pesos(socio.devuelto)} color="#047857" fondo="#ecfdf5" />
              <Cifra
                titulo={socio.pendiente > 0 ? 'Queda debiendo' : 'Queda debiendo'}
                valor={pesos(socio.pendiente)}
                color={socio.pendiente > 0 ? '#b91c1c' : '#047857'}
                fondo={socio.pendiente > 0 ? '#fef2f2' : '#ecfdf5'}
              />
            </div>

            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px 0' }}>Movimiento por movimiento</h2>

            {socio.adelantos.map((adelanto, i) => (
              <div
                key={`${adelanto.fecha}-${i}`}
                style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '10px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>
                    Adelanto del {fechaCorta(adelanto.fecha)}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '15px', color: '#b45309' }}>{pesos(adelanto.monto)}</span>
                </div>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                  Entregado por {adelanto.metodo}
                  {adelanto.notas ? ` · ${adelanto.notas}` : ''}
                </p>

                {adelanto.devoluciones.map((devolucion, j) => (
                  <div
                    key={`${devolucion.fecha}-${j}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '8px',
                      paddingLeft: '14px',
                      borderLeft: '3px solid #a7f3d0',
                      fontSize: '13px',
                      color: '#047857',
                    }}
                  >
                    <span>
                      Devolvió el {fechaCorta(devolucion.fecha)} por {devolucion.metodo}
                    </span>
                    <span style={{ fontWeight: 700 }}>−{pesos(devolucion.monto)}</span>
                  </div>
                ))}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px dashed #e5e7eb',
                    fontSize: '13px',
                    fontWeight: 700,
                  }}
                >
                  <span>{adelanto.pendiente > 0 ? 'Queda de este adelanto' : 'Devuelto completo'}</span>
                  <span style={{ color: adelanto.pendiente > 0 ? '#b91c1c' : '#047857' }}>
                    {pesos(adelanto.pendiente)}
                  </span>
                </div>
              </div>
            ))}

            <p style={{ marginTop: '24px', fontSize: '12px', color: '#6b7280', lineHeight: 1.6 }}>
              Lo que queda debiendo se le descuenta de su liquidación al cerrar el período. Lo que ya devolvió no se le
              descuenta.
              <br />
              {empresa.nombre} · NIT {empresa.nit}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}

function Cifra({ titulo, valor, color, fondo }: { titulo: string; valor: string; color: string; fondo: string }) {
  return (
    <div style={{ flex: 1, backgroundColor: fondo, borderRadius: '10px', padding: '14px' }}>
      <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>{titulo}</p>
      <p style={{ margin: '4px 0 0 0', fontSize: '22px', fontWeight: 800, color }}>{valor}</p>
    </div>
  )
}
