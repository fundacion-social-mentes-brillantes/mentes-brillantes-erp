'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, FileImage, Search, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatearFechaHora, formatearFechaIso } from '@/lib/utils/fechas'
import { pesos } from '@/lib/utils/pesos'
import { metodoPagoLegible } from '@/lib/utils/textos'
import { documentoLegible, edadLegible, kitLegible, type EstadoPagoTaller, type PreguntaTaller } from '@/lib/operaciones/talleres-reglas'
import { anularMovimientoTallerAction, cancelarInscripcionAction, marcarAsistenciaAction } from '../actions'
import { ChipEstadoPago, ChipKit, type PreciosNinos } from '../piezas'
import { FormularioEditarInscripcion, FormularioInscripcion, FormularioPago } from './formularios'

export type PagoFila = { id: string; monto: number; metodo_pago: string; fecha: string; estado?: string | null; notas?: string | null }

export type FilaInscrito = {
  id: string
  nombre: string
  documento: string | null
  edad: number | null
  kit: boolean | null
  telefono: string | null
  correo: string | null
  respuestas: Record<string, string>
  valor_acordado: number
  estado: string
  asistio: boolean
  hora_llegada: string | null
  origen: string
  asistente_id: string | null
  comprobante_ruta: string | null
  comprobante_en: string | null
  notas: string | null
  creado_en: string
  pagado: number
  pendiente: number
  estadoPago: EstadoPagoTaller
  pagos: PagoFila[]
}

type Filtro = 'todos' | 'deben' | 'pagaron' | 'cancelados'

const ORIGEN: Record<string, string> = {
  invitacion: 'desde la invitación',
  puerta: 'en la puerta',
  manual: 'por el equipo',
}

function coincide(fila: FilaInscrito, busqueda: string) {
  if (!busqueda) return true
  const b = busqueda.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const nombre = fila.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return nombre.includes(b) || (fila.documento ?? '').toLowerCase().includes(b) || (fila.telefono ?? '').includes(b.replace(/\D/g, '') || '~')
}

export function InscritosTaller({
  tallerId,
  precio,
  preciosNinos = null,
  preguntas,
  filas,
  hoy,
  isAdmin,
  inscribirAbierto = false,
}: {
  tallerId: string
  precio: number
  /** Lo que pagan los niños con kit y sin kit (si el taller cobra distinto). */
  preciosNinos?: PreciosNinos | null
  preguntas: PreguntaTaller[]
  filas: FilaInscrito[]
  hoy: string
  isAdmin: boolean
  inscribirAbierto?: boolean
}) {
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [inscribiendo, setInscribiendo] = useState(inscribirAbierto)
  const [aviso, setAviso] = useState<string | null>(null)

  const activas = filas.filter((f) => f.estado !== 'cancelado')
  const conteo = {
    todos: activas.length,
    deben: activas.filter((f) => f.pendiente > 0).length,
    pagaron: activas.filter((f) => f.pendiente <= 0).length,
    cancelados: filas.length - activas.length,
  }

  const visibles = useMemo(
    () =>
      filas
        .filter((f) => {
          if (filtro === 'cancelados') return f.estado === 'cancelado'
          if (f.estado === 'cancelado') return false
          if (filtro === 'deben') return f.pendiente > 0
          if (filtro === 'pagaron') return f.pendiente <= 0
          return true
        })
        .filter((f) => coincide(f, busqueda.trim())),
    [filas, filtro, busqueda]
  )

  const filtros: Array<{ clave: Filtro; nombre: string }> = [
    { clave: 'todos', nombre: 'Todos' },
    { clave: 'deben', nombre: 'Deben' },
    { clave: 'pagaron', nombre: 'Al día' },
    ...(conteo.cancelados > 0 ? [{ clave: 'cancelados' as const, nombre: 'Cancelados' }] : []),
  ]

  return (
    <div className="space-y-4">
      {aviso && (
        <p className="rounded-xl bg-verde/12 px-4 py-2.5 text-sm font-medium text-verde" role="status">
          {aviso}
        </p>
      )}

      {inscribiendo ? (
        <section className="rounded-2xl border border-linea bg-panel p-5">
          <h2 className="mb-4 text-base font-semibold text-tinta">Inscribir persona</h2>
          <FormularioInscripcion
            tallerId={tallerId}
            precio={precio}
            preciosNinos={preciosNinos}
            preguntas={preguntas}
            hoy={hoy}
            isAdmin={isAdmin}
            alTerminar={(mensaje) => {
              setInscribiendo(false)
              setAviso(mensaje ?? 'Inscripción guardada.')
            }}
            alCancelar={() => setInscribiendo(false)}
          />
        </section>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gris" aria-hidden />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, cédula o celular"
              aria-label="Buscar inscrito"
              className="pl-9"
            />
          </div>
          <Button
            onClick={() => {
              setAviso(null)
              setInscribiendo(true)
            }}
          >
            <UserPlus className="h-4 w-4" />
            Inscribir persona
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar inscritos">
        {filtros.map((f) => (
          <button
            key={f.clave}
            type="button"
            onClick={() => setFiltro(f.clave)}
            aria-pressed={filtro === f.clave}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              filtro === f.clave ? 'bg-acento/12 text-acento' : 'bg-panel text-gris ring-1 ring-linea hover:text-tinta'
            }`}
          >
            {f.nombre} <span className="opacity-70">{conteo[f.clave]}</span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-2xl border border-linea bg-panel px-6 py-10 text-center text-sm text-gris">
          {filas.length === 0
            ? 'Todavía no hay nadie inscrito. Usa «Inscribir persona», o espera las inscripciones de la invitación.'
            : 'Nadie coincide con esa búsqueda.'}
        </div>
      ) : (
        <>
          {/* Computador */}
          <div className="hidden overflow-hidden rounded-2xl border border-linea bg-panel md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-linea">
                <tr>
                  <th className="px-5 py-3">Persona</th>
                  <th className="px-5 py-3 text-right">Valor</th>
                  <th className="px-5 py-3 text-right">Pagó</th>
                  <th className="px-5 py-3 text-right">Falta</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-center">Llegó</th>
                  <th className="px-5 py-3" aria-label="Más" />
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {visibles.map((fila) => {
                  const expandida = abierta === fila.id
                  return (
                    <Fragment key={fila.id}>
                      <tr className={`${fila.estado === 'cancelado' ? 'opacity-60' : ''} ${expandida ? 'bg-suave/60' : 'hover:bg-suave/50'}`}>
                        <td className="px-5 py-3">
                          <button type="button" onClick={() => setAbierta(expandida ? null : fila.id)} className="text-left">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-tinta hover:text-acento">{fila.nombre}</span>
                              <ChipKit kit={fila.kit} />
                            </span>
                            <span className="block text-xs text-gris">
                              {[fila.documento && documentoLegible(fila.documento), edadLegible(fila.edad), fila.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                            </span>
                          </button>
                        </td>
                        <td className="cifra px-5 py-3 text-right text-tinta">{fila.valor_acordado > 0 ? pesos(fila.valor_acordado) : 'Sin costo'}</td>
                        <td className="cifra px-5 py-3 text-right text-verde">{fila.pagado > 0 ? pesos(fila.pagado) : <span className="text-gris">—</span>}</td>
                        <td className="cifra px-5 py-3 text-right font-semibold text-ambar">
                          {fila.pendiente > 0 ? pesos(fila.pendiente) : <span className="font-normal text-gris">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          {fila.estado === 'cancelado' ? <span className="text-xs font-semibold text-gris">Cancelada</span> : <ChipEstadoPago estado={fila.estadoPago} />}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {fila.asistio ? <Check className="mx-auto h-5 w-5 text-verde" aria-label="Llegó" /> : <span className="text-gris">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setAbierta(expandida ? null : fila.id)}
                            aria-expanded={expandida}
                            aria-label={expandida ? 'Cerrar detalle' : 'Ver detalle y acciones'}
                            className="inline-grid h-9 w-9 place-items-center rounded-lg text-gris hover:bg-suave hover:text-tinta"
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform ${expandida ? 'rotate-180' : ''}`} />
                          </button>
                        </td>
                      </tr>
                      {expandida && (
                        <tr className="bg-suave/60">
                          <td colSpan={7} className="px-5 pb-5 pt-1">
                            <DetalleInscrito
                              fila={fila}
                              tallerId={tallerId}
                              preguntas={preguntas}
                              hoy={hoy}
                              isAdmin={isAdmin}
                              alAvisar={setAviso}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Celular */}
          <div className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-panel md:hidden">
            {visibles.map((fila) => {
              const expandida = abierta === fila.id
              return (
                <div key={fila.id} className={fila.estado === 'cancelado' ? 'opacity-60' : ''}>
                  <button
                    type="button"
                    onClick={() => setAbierta(expandida ? null : fila.id)}
                    aria-expanded={expandida}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left active:bg-suave"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-semibold text-tinta">
                        {fila.asistio && <Check className="h-4 w-4 shrink-0 text-verde" aria-label="Llegó" />}
                        <span className="truncate">{fila.nombre}</span>
                        <ChipKit kit={fila.kit} />
                      </p>
                      <p className="mt-0.5 text-xs text-gris">
                        {fila.pagado > 0 ? `Pagó ${pesos(fila.pagado)}` : 'Sin pagos'}
                        {fila.pendiente > 0 && <span className="font-semibold text-ambar"> · faltan {pesos(fila.pendiente)}</span>}
                      </p>
                    </div>
                    {fila.estado === 'cancelado' ? (
                      <span className="text-xs font-semibold text-gris">Cancelada</span>
                    ) : (
                      <ChipEstadoPago estado={fila.estadoPago} />
                    )}
                  </button>
                  {expandida && (
                    <div className="bg-suave/60 px-4 pb-4">
                      <DetalleInscrito fila={fila} tallerId={tallerId} preguntas={preguntas} hoy={hoy} isAdmin={isAdmin} alAvisar={setAviso} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function textoRespuesta(pregunta: PreguntaTaller, valor: string) {
  if (pregunta.tipo === 'si_no') return valor === 'si' ? 'Sí' : valor === 'no' ? 'No' : valor
  return valor
}

function DetalleInscrito({
  fila,
  tallerId,
  preguntas,
  hoy,
  isAdmin,
  alAvisar,
}: {
  fila: FilaInscrito
  tallerId: string
  preguntas: PreguntaTaller[]
  hoy: string
  isAdmin: boolean
  alAvisar: (mensaje: string | null) => void
}) {
  const [modo, setModo] = useState<'ver' | 'pagar' | 'editar'>('ver')
  const [error, setError] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()
  const cancelada = fila.estado === 'cancelado'
  const pagosValidos = fila.pagos.filter((p) => p.estado !== 'anulado' && !String(p.notas ?? '').includes('[ANULADO]'))

  const ejecutar = (tarea: () => Promise<{ error?: string } | null>, mensaje?: string) => {
    setError(null)
    iniciar(async () => {
      const r = await tarea()
      if (r?.error) setError(r.error)
      else if (mensaje) alAvisar(mensaje)
    })
  }

  const respuestas = preguntas.filter((p) => fila.respuestas?.[p.id])

  return (
    <div className="space-y-4 pt-2">
      {error && (
        <p className="rounded-xl border border-rojo/30 bg-rojo/10 px-3 py-2 text-sm font-medium text-rojo" role="alert">
          {error}
        </p>
      )}

      {modo === 'pagar' && (
        <div className="rounded-xl border border-linea bg-panel p-4">
          <FormularioPago
            tallerId={tallerId}
            inscripcionId={fila.id}
            pendiente={fila.pendiente}
            hoy={hoy}
            alTerminar={(m) => {
              setModo('ver')
              alAvisar(`${fila.nombre}: ${m ?? 'pago registrado.'}`)
            }}
            alCancelar={() => setModo('ver')}
          />
        </div>
      )}

      {modo === 'editar' && (
        <div className="rounded-xl border border-linea bg-panel p-4">
          <FormularioEditarInscripcion
            tallerId={tallerId}
            inscripcion={fila}
            isAdmin={isAdmin}
            alTerminar={() => {
              setModo('ver')
              alAvisar(`${fila.nombre}: datos guardados.`)
            }}
            alCancelar={() => setModo('ver')}
          />
        </div>
      )}

      {modo === 'ver' && (
        <>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-gris">Documento</dt>
              <dd className="text-tinta">{fila.documento ? documentoLegible(fila.documento) : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gris">Edad</dt>
              <dd className="text-tinta">{edadLegible(fila.edad) || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gris">Kit</dt>
              <dd className="text-tinta">{kitLegible(fila.kit) || 'Sin dato'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gris">Celular</dt>
              <dd className="text-tinta">
                {fila.telefono ? (
                  <a
                    href={`https://wa.me/${fila.telefono.length === 10 ? `57${fila.telefono}` : fila.telefono}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-acento hover:underline"
                  >
                    {fila.telefono}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gris">Correo</dt>
              <dd className="break-all text-tinta">{fila.correo || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gris">Se inscribió</dt>
              <dd className="text-tinta">
                {formatearFechaHora(fila.creado_en)} {ORIGEN[fila.origen] ?? ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gris">Llegada</dt>
              <dd className="text-tinta">{fila.asistio ? formatearFechaHora(fila.hora_llegada, 'Sí') : 'No ha llegado'}</dd>
            </div>
            {fila.asistente_id && (
              <div>
                <dt className="text-xs text-gris">En el ERP</dt>
                <dd>
                  <Link href={`/asistentes/${fila.asistente_id}`} prefetch={false} className="text-acento hover:underline">
                    Ver su ficha
                  </Link>
                </dd>
              </div>
            )}
            {respuestas.map((p) => (
              <div key={p.id} className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs text-gris">{p.texto}</dt>
                <dd className="text-tinta">{textoRespuesta(p, fila.respuestas[p.id])}</dd>
              </div>
            ))}
            {fila.notas && (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs text-gris">Notas</dt>
                <dd className="whitespace-pre-line text-tinta">{fila.notas}</dd>
              </div>
            )}
          </dl>

          {fila.comprobante_ruta && (
            <a
              href={`/talleres/${tallerId}/comprobante/${fila.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-acento hover:underline"
            >
              <FileImage className="h-4 w-4" />
              Ver comprobante que subió{fila.comprobante_en ? ` (${formatearFechaHora(fila.comprobante_en)})` : ''}
            </a>
          )}

          <div>
            <p className="mb-1.5 text-xs text-gris">Pagos</p>
            {fila.pagos.length === 0 ? (
              <p className="text-sm text-gris">Todavía no ha pagado nada.</p>
            ) : (
              <ul className="divide-y divide-linea rounded-xl border border-linea bg-panel">
                {fila.pagos.map((pago) => {
                  const anulado = pago.estado === 'anulado' || String(pago.notas ?? '').includes('[ANULADO]')
                  return (
                    <li key={pago.id} className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${anulado ? 'text-gris line-through' : ''}`}>
                      <span>
                        {formatearFechaIso(pago.fecha)} · {metodoPagoLegible(pago.metodo_pago)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`cifra font-semibold ${anulado ? '' : 'text-verde'}`}>{pesos(pago.monto)}</span>
                        {isAdmin && !anulado && (
                          <button
                            type="button"
                            disabled={enviando}
                            onClick={() => {
                              if (!window.confirm(`¿Anular este pago de ${pesos(pago.monto)}? Úsalo si se registró por error o si se le devolvió la plata.`)) return
                              ejecutar(() => anularMovimientoTallerAction(tallerId, 'venta_externa', pago.id), 'Pago anulado.')
                            }}
                            className="rounded-md px-2 py-1 text-xs font-medium text-gris hover:bg-rojo/10 hover:text-rojo disabled:opacity-50"
                          >
                            Anular
                          </button>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {!cancelada && (
            <div className="flex flex-wrap gap-2">
              {fila.pendiente > 0 && (
                <Button size="sm" onClick={() => setModo('pagar')} disabled={enviando}>
                  Registrar pago
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={enviando}
                onClick={() =>
                  ejecutar(
                    () => marcarAsistenciaAction(tallerId, fila.id, !fila.asistio),
                    fila.asistio ? `${fila.nombre}: se quitó la llegada.` : `${fila.nombre}: llegó.`
                  )
                }
              >
                {fila.asistio ? 'Quitar llegada' : 'Marcar que llegó'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setModo('editar')} disabled={enviando}>
                Editar datos
              </Button>
              {pagosValidos.length === 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rojo hover:bg-rojo/10"
                  disabled={enviando}
                  onClick={() => {
                    if (!window.confirm(`¿Cancelar la inscripción de ${fila.nombre}? Deja de contar en el taller y no debe nada.`)) return
                    ejecutar(() => cancelarInscripcionAction(tallerId, fila.id), `${fila.nombre}: inscripción cancelada.`)
                  }}
                >
                  Cancelar inscripción
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
