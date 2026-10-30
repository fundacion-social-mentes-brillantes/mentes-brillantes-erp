'use client'

import { useMemo, useOptimistic, useState, useTransition } from 'react'
import { Check, ScanLine, Search, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { pesos } from '@/lib/utils/pesos'
import { documentoLegible, type PreguntaTaller } from '@/lib/operaciones/talleres-reglas'
import { marcarAsistenciaAction } from '../actions'
import { EscanerQr, prepararSonido } from './EscanerQr'
import { FormularioInscripcion, FormularioPago } from './formularios'
import type { FilaInscrito } from './InscritosTaller'

// La vista del dia del taller, pensada para el celular en la puerta: leer el QR
// de la boleta (o buscar a la persona), tocar «llego» y, si debe, cobrarle ahi
// mismo.

const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function PuertaTaller({
  tallerId,
  precio,
  preguntas,
  filas,
  hoy,
  isAdmin,
  escanear = false,
}: {
  tallerId: string
  precio: number
  preguntas: PreguntaTaller[]
  filas: FilaInscrito[]
  hoy: string
  isAdmin: boolean
  /** Abre el lector de QR de una vez (?escanear=1, desde la pagina de una entrada). */
  escanear?: boolean
}) {
  const activas = useMemo(
    () => filas.filter((f) => f.estado !== 'cancelado').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [filas]
  )
  const [llegadas, marcarOptimista] = useOptimistic(
    new Map(activas.map((f) => [f.id, f.asistio])),
    (actual: Map<string, boolean>, cambio: { id: string; asistio: boolean }) => new Map(actual).set(cambio.id, cambio.asistio)
  )
  const [, iniciar] = useTransition()
  const [busqueda, setBusqueda] = useState('')
  const [cobrando, setCobrando] = useState<string | null>(null)
  const [nueva, setNueva] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null)
  const [escaneando, setEscaneando] = useState(escanear)

  const cerrarLector = () => {
    setEscaneando(false)
    // que al recargar la pagina no se vuelva a abrir solo
    const url = new URL(window.location.href)
    if (url.searchParams.has('escanear')) {
      url.searchParams.delete('escanear')
      window.history.replaceState(window.history.state, '', url)
    }
  }

  const llegaron = activas.filter((f) => llegadas.get(f.id)).length
  const b = sinTildes(busqueda.trim())
  const visibles = b
    ? activas.filter((f) => sinTildes(f.nombre).includes(b) || sinTildes(f.documento ?? '').includes(b) || (f.telefono ?? '').includes(b))
    : activas

  const alternar = (fila: FilaInscrito) => {
    const asistio = !llegadas.get(fila.id)
    setAviso(null)
    iniciar(async () => {
      marcarOptimista({ id: fila.id, asistio })
      const r = await marcarAsistenciaAction(tallerId, fila.id, asistio)
      if (r?.error) setAviso({ texto: r.error, error: true })
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-linea bg-panel p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-gris">Llegaron</p>
          <p className="text-sm text-gris">
            <span className="cifra text-2xl font-bold text-tinta">{llegaron}</span> de {activas.length}
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-suave-2" aria-hidden>
          <div className="h-full rounded-full bg-verde transition-[width] duration-300" style={{ width: `${activas.length ? (llegaron / activas.length) * 100 : 0}%` }} />
        </div>
      </div>

      <Button
        className="h-12 w-full text-base"
        onClick={() => {
          prepararSonido()
          setEscaneando(true)
        }}
      >
        <ScanLine className="h-5 w-5" />
        Escanear QR de las entradas
      </Button>
      {escaneando && <EscanerQr tallerId={tallerId} llegaron={llegaron} total={activas.length} alCerrar={cerrarLector} />}

      {aviso && (
        <p
          className={`rounded-xl px-4 py-2.5 text-sm font-medium ${aviso.error ? 'border border-rojo/30 bg-rojo/10 text-rojo' : 'bg-verde/12 text-verde'}`}
          role={aviso.error ? 'alert' : 'status'}
        >
          {aviso.texto}
        </p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gris" aria-hidden />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o cédula"
          aria-label="Buscar a quien llega"
          className="h-12 pl-9 text-base"
        />
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-2xl border border-linea bg-panel px-6 py-8 text-center text-sm text-gris">
          {activas.length === 0 ? 'Todavía no hay nadie inscrito.' : 'Nadie coincide. Si no se había inscrito, regístralo abajo.'}
        </div>
      ) : (
        <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-panel">
          {visibles.map((fila) => {
            const llego = Boolean(llegadas.get(fila.id))
            return (
              <li key={fila.id}>
                <div className="flex items-center gap-3 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => alternar(fila)}
                    aria-pressed={llego}
                    aria-label={llego ? `Quitar la llegada de ${fila.nombre}` : `Marcar que llegó ${fila.nombre}`}
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                      llego ? 'border-verde bg-verde text-fondo' : 'border-linea-fuerte text-transparent hover:border-verde'
                    }`}
                  >
                    <Check className="h-6 w-6" strokeWidth={3} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-tinta">{fila.nombre}</p>
                    <p className="text-xs text-gris">
                      {fila.pendiente > 0 ? (
                        <span className="font-semibold text-ambar">Debe {pesos(fila.pendiente)}</span>
                      ) : fila.valor_acordado > 0 ? (
                        <span className="text-verde">Pagó todo</span>
                      ) : (
                        'Sin costo'
                      )}
                      {fila.documento ? ` · ${documentoLegible(fila.documento)}` : ''}
                    </p>
                  </div>
                  {fila.pendiente > 0 && cobrando !== fila.id && (
                    <Button size="sm" variant="outline" onClick={() => setCobrando(fila.id)}>
                      Cobrar
                    </Button>
                  )}
                </div>
                {cobrando === fila.id && (
                  <div className="border-t border-linea bg-suave/60 px-3 py-3">
                    <FormularioPago
                      tallerId={tallerId}
                      inscripcionId={fila.id}
                      pendiente={fila.pendiente}
                      hoy={hoy}
                      alTerminar={() => {
                        setCobrando(null)
                        setAviso({ texto: `${fila.nombre}: pago registrado.` })
                      }}
                      alCancelar={() => setCobrando(null)}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {nueva ? (
        <section className="rounded-2xl border border-linea bg-panel p-5">
          <h2 className="mb-1 text-base font-semibold text-tinta">Llegó alguien que no estaba inscrito</h2>
          <p className="mb-4 text-sm text-gris">Queda en la lista del taller y marcado que llegó. No se le abre ficha en el ERP.</p>
          <FormularioInscripcion
            tallerId={tallerId}
            precio={precio}
            preguntas={preguntas}
            hoy={hoy}
            isAdmin={isAdmin}
            enLaPuerta
            alTerminar={(mensaje) => {
              setNueva(false)
              setAviso({ texto: mensaje ?? 'Inscripción guardada.' })
            }}
            alCancelar={() => setNueva(false)}
          />
        </section>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setNueva(true)}>
          <UserPlus className="h-4 w-4" />
          Llegó alguien que no estaba inscrito
        </Button>
      )}
    </div>
  )
}
