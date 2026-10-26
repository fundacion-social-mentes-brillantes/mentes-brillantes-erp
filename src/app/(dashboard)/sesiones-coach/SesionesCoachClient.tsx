'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sellos } from '@/components/coach/Sellos'
import { Search, CalendarPlus, History, X, CheckCircle2 } from 'lucide-react'
import { registrarSesionCoachAsistente, editarSesion, eliminarSesion } from '@/app/(dashboard)/coach/actions'
import { estadoCoach } from '@/lib/utils/coach'
import { coincideBusqueda } from '@/lib/utils/busqueda'
import { pesos } from '@/lib/utils/pesos'

type Sesion = { id: string; fecha: string; notas?: string | null; paqueteId?: string; paqueteConcepto?: string | null }

/** Una compra concreta, con las sesiones que salieron de ella. */
type Compra = {
  id: string
  cuentaId: string | null
  concepto: string | null
  compradoEl: string | null
  valorTotal: number
  pendiente: number
  compradas: number
  usadas: number
  restantes: number
  sesiones: Sesion[]
}

type AsistenteCoach = {
  asistenteId: string
  nombre: string
  codigo: string | null
  cedula: string | null
  compradas: number
  realizadas: number
  restantes: number
  ultimaSesion: string | null
  sesiones: Sesion[]
  compras: Compra[]
}


type Filtro = 'todos' | 'pendientes' | 'sin'

const fmtFecha = (f?: string | null) => {
  if (!f) return '—'
  // f viene como YYYY-MM-DD; se muestra sin reinterpretar zona horaria.
  const [y, m, d] = f.split('-')
  if (!y || !m || !d) return f
  return `${d}/${m}/${y}`
}

const ESTADO_BADGE: Record<string, string> = {
  disponible: 'bg-verde/15 text-verde border-verde/30',
  ultima: 'bg-ambar/15 text-ambar border-ambar/30',
  agotado: 'bg-linea text-gris border-linea-fuerte',
}
const ESTADO_DOT: Record<string, string> = {
  disponible: 'bg-verde',
  ultima: 'bg-ambar',
  agotado: 'bg-linea-fuerte',
}
const ESTADO_TEXTO: Record<string, string> = {
  disponible: 'Disponible',
  ultima: 'Última sesión',
  agotado: 'Sin sesiones',
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="absolute inset-0" onClick={onClose} aria-label="Cerrar" />
      <div className="relative w-full sm:max-w-lg bg-panel rounded-t-2xl sm:rounded-2xl shadow-strong border border-linea max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-linea sticky top-0 bg-panel">
          <h3 className="font-semibold text-tinta">{title}</h3>
          <button onClick={onClose} className="text-gris hover:text-tinta" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

function RegistrarModal({
  asistente,
  hoy,
  onClose,
  onDone,
}: {
  asistente: AsistenteCoach
  hoy: string
  onClose: () => void
  onDone: () => void
}) {
  const [fecha, setFecha] = useState(hoy)
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const sinCupo = asistente.restantes <= 0

  const handleGuardar = () => {
    setError(null)
    startTransition(async () => {
      const result = await registrarSesionCoachAsistente(asistente.asistenteId, fecha, notas)
      if (result?.error) setError(result.error)
      else onDone()
    })
  }

  return (
    <Modal title="Registrar sesión" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="text-lg font-semibold text-tinta">{asistente.nombre}</p>
          {asistente.codigo && <p className="text-xs text-gris">Código {asistente.codigo}</p>}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-suave p-2">
            <p className="text-xs text-gris">Compradas</p>
            <p className="text-lg font-bold text-tinta">{asistente.compradas}</p>
          </div>
          <div className="rounded-xl bg-suave p-2">
            <p className="text-xs text-gris">Tomadas</p>
            <p className="text-lg font-bold text-verde">{asistente.realizadas}</p>
          </div>
          <div className="rounded-xl bg-suave p-2">
            <p className="text-xs text-gris">Restantes</p>
            <p className="text-lg font-bold text-ambar">{asistente.restantes}</p>
          </div>
        </div>

        {sinCupo ? (
          <p className="rounded-md bg-ambar/10 border border-ambar/30 text-ambar text-sm px-3 py-2">
            Este asistente no tiene sesiones disponibles. No se puede registrar una nueva sesión.
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gris">Fecha de la sesión</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full h-10 rounded-2xl border border-linea bg-panel px-3 text-sm text-tinta"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gris">Notas (opcional)</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                placeholder="Observaciones breves"
                className="w-full rounded-2xl border border-linea bg-panel px-3 py-2 text-sm text-tinta"
              />
            </div>
          </>
        )}

        {error && <p className="text-sm text-rojo bg-rojo/10 border border-rojo/30 rounded-md px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-semibold text-tinta hover:bg-suave">
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={sinCupo || isPending}
            className="h-10 rounded-xl bg-acento px-4 text-sm font-semibold text-sobre-acento hover:bg-acento-fuerte disabled:opacity-50"
          >
            {isPending ? 'Guardando...' : 'Guardar sesión'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function HistorialModal({
  asistente,
  isAdmin,
  onClose,
  onChanged,
}: {
  asistente: AsistenteCoach
  isAdmin: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [editId, setEditId] = useState<string | null>(null)
  const [editFecha, setEditFecha] = useState('')
  const [editNotas, setEditNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const guardarEdicion = (sesionId: string) => {
    setError(null)
    const fd = new FormData()
    fd.set('sesion_id', sesionId)
    fd.set('fecha', editFecha)
    fd.set('notas', editNotas)
    startTransition(async () => {
      const r = await editarSesion(null, fd)
      if (r?.error) setError(r.error)
      else {
        setEditId(null)
        onChanged()
      }
    })
  }

  const eliminar = (sesionId: string) => {
    if (!window.confirm('¿Eliminar esta sesión registrada? Esta acción no se puede deshacer.')) return
    setError(null)
    const fd = new FormData()
    fd.set('sesion_id', sesionId)
    startTransition(async () => {
      const r = await eliminarSesion(null, fd)
      if (r?.error) setError(r.error)
      else onChanged()
    })
  }

  return (
    <Modal title="Historial de sesiones" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="text-lg font-semibold text-tinta">{asistente.nombre}</p>
          <p className="text-xs text-gris">
            {asistente.realizadas} de {asistente.compradas} tomadas · {asistente.restantes} restantes
          </p>
        </div>

        {error && <p className="text-sm text-rojo bg-rojo/10 border border-rojo/30 rounded-md px-3 py-2">{error}</p>}

        {/* Compra por compra, de la más nueva a la más vieja, con las sesiones que
            salieron de cada una. El total de arriba sigue estando; esto es para
            poder ver qué se compró y cuándo, sin que quede todo revuelto. */}
        {asistente.compras.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gris">
              Paquetes comprados ({asistente.compras.length})
            </p>
            {asistente.compras.map((compra, i) => (
              <div key={compra.id} className="rounded-lg border border-linea overflow-hidden">
                <div className="px-3 py-2 bg-suave space-y-0.5">
                  <p className="text-sm font-medium text-tinta">
                    {compra.concepto || 'Paquete coach'}
                    {i === 0 && asistente.compras.length > 1 && (
                      <span className="ml-2 text-xs font-bold text-acento">el último</span>
                    )}
                  </p>
                  <p className="text-xs text-gris">
                    Comprado el {fmtFecha(compra.compradoEl)} · {compra.usadas} de {compra.compradas} tomadas ·{' '}
                    {compra.restantes} {compra.restantes === 1 ? 'queda' : 'quedan'}
                    {compra.valorTotal > 0 && <> · {pesos(compra.valorTotal)}</>}
                    {compra.pendiente > 0 && (
                      <span className="text-ambar"> · debe {pesos(compra.pendiente)}</span>
                    )}
                  </p>
                </div>
                {compra.sesiones.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gris">Sin sesiones tomadas todavía.</p>
                ) : (
                  <ul className="divide-y divide-linea">
                    {compra.sesiones.map((s) => (
                      <li key={s.id} className="px-3 py-1.5 text-xs text-tinta">
                        {fmtFecha(s.fecha)}
                        {s.notas && <span className="text-gris"> · {s.notas}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs font-semibold text-gris pt-1">
          Todas las sesiones
        </p>

        {asistente.sesiones.length === 0 ? (
          <p className="text-sm text-gris py-6 text-center">Aún no hay sesiones registradas.</p>
        ) : (
          <ul className="divide-y divide-linea border border-linea rounded-lg overflow-hidden">
            {asistente.sesiones.map((s) => (
              <li key={s.id} className="p-3 text-sm">
                {editId === s.id ? (
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={editFecha}
                      onChange={(e) => setEditFecha(e.target.value)}
                      className="w-full h-9 rounded-md border border-linea bg-panel px-2 text-sm text-tinta"
                    />
                    <textarea
                      value={editNotas}
                      onChange={(e) => setEditNotas(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-linea bg-panel px-2 py-1 text-sm text-tinta"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditId(null)} className="text-xs text-gris hover:underline">Cancelar</button>
                      <button
                        onClick={() => guardarEdicion(s.id)}
                        disabled={isPending}
                        className="text-xs font-medium text-sobre-acento bg-acento hover:bg-acento-fuerte rounded-md px-3 py-1 disabled:opacity-50"
                      >
                        {isPending ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-tinta">{fmtFecha(s.fecha)}</p>
                      <p className="text-gris text-xs truncate">{s.notas || 'Sin notas'}</p>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-3 shrink-0">
                        <button
                          onClick={() => {
                            setEditId(s.id)
                            setEditFecha(s.fecha)
                            setEditNotas(s.notas || '')
                            setError(null)
                          }}
                          className="text-xs text-info hover:underline"
                        >
                          Editar
                        </button>
                        <button onClick={() => eliminar(s.id)} disabled={isPending} className="text-xs text-rojo hover:underline disabled:opacity-50">
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

export function SesionesCoachClient({
  asistentes,
  hoy,
  isAdmin,
}: {
  asistentes: AsistenteCoach[]
  hoy: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [registrar, setRegistrar] = useState<AsistenteCoach | null>(null)
  const [historial, setHistorial] = useState<AsistenteCoach | null>(null)

  const filtrados = useMemo(() => {
    return asistentes.filter((a) => {
      if (filtro === 'pendientes' && a.restantes <= 0) return false
      if (filtro === 'sin' && a.restantes > 0) return false
      return coincideBusqueda([a.nombre, a.codigo, a.cedula], query)
    })
  }, [asistentes, query, filtro])

  const refrescar = () => router.refresh()

  const filtroBtn = (value: Filtro, label: string) => (
    <button
      onClick={() => setFiltro(value)}
      aria-pressed={filtro === value}
      className={`h-9 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
        filtro === value
          ? 'border-acento bg-acento text-sobre-acento'
          : 'border-linea bg-panel text-gris hover:text-tinta'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Sesiones Coach</h1>
          <p className="mt-1 text-sm text-gris">Sesiones de guía coach por asistente: compradas, tomadas y restantes.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gris" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, código o cédula..."
            className="h-10 w-full rounded-2xl border border-linea bg-panel pl-9 pr-4 text-sm text-tinta transition-colors placeholder:text-gris hover:border-linea-fuerte focus:border-acento"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filtroBtn('todos', 'Todos')}
          {filtroBtn('pendientes', 'Con pendientes')}
          {filtroBtn('sin', 'Sin restantes')}
        </div>
      </div>

      <p className="text-sm text-gris">{filtrados.length} asistente(s) con paquete coach</p>

      {filtrados.length === 0 ? (
        <div className="rounded-2xl border border-linea bg-panel p-10 text-center text-sm text-gris">
          No hay asistentes que coincidan con la búsqueda o el filtro.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((a) => {
            const estado = estadoCoach(a.restantes)
            return (
              <div key={a.asistenteId} className="rounded-2xl border border-linea bg-panel p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-tinta truncate">{a.nombre}</p>
                    <p className="text-xs text-gris">{a.codigo ? `Código ${a.codigo}` : 'Sin código'}</p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_BADGE[estado]}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${ESTADO_DOT[estado]}`} />
                    {ESTADO_TEXTO[estado]}
                  </span>
                </div>

                <div>
                  <p className="text-sm text-gris">
                    <span className={`text-2xl font-semibold ${estado === 'agotado' ? 'text-gris' : 'text-tinta'}`}>{a.restantes}</span>{' '}
                    por tomar · {a.realizadas} de {a.compradas} tomadas
                  </p>
                  <Sellos tomadas={a.realizadas} total={a.compradas} className="mt-2" />
                </div>

                <p className="text-sm text-gris flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Última sesión: {fmtFecha(a.ultimaSesion)}
                </p>

                {/* Cuál fue la última compra: sin esto los paquetes se leen revueltos. */}
                {a.compras[0] && (
                  <p className="text-sm text-gris">
                    Último paquete: <span className="text-tinta">{a.compras[0].concepto || 'Paquete coach'}</span>{' '}
                    · comprado el {fmtFecha(a.compras[0].compradoEl)} · {a.compras[0].usadas}/{a.compras[0].compradas}
                    {a.compras.length > 1 && <> · {a.compras.length} compras en total</>}
                    {a.compras[0].pendiente > 0 && (
                      <span className="text-ambar"> · debe {pesos(a.compras[0].pendiente)}</span>
                    )}
                  </p>
                )}

                <div className="mt-auto flex gap-2 pt-1">
                  <button
                    onClick={() => setRegistrar(a)}
                    disabled={a.restantes <= 0}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-acento px-3 text-sm font-semibold text-sobre-acento transition-colors hover:bg-acento-fuerte disabled:opacity-50"
                    title={a.restantes <= 0 ? 'Sin sesiones disponibles' : 'Registrar sesión'}
                  >
                    <CalendarPlus className="w-4 h-4" />
                    Registrar
                  </button>
                  <button
                    onClick={() => setHistorial(a)}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-linea bg-panel px-3 text-sm font-semibold text-tinta transition-colors hover:border-linea-fuerte hover:bg-suave"
                  >
                    <History className="w-4 h-4" />
                    Historial
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {registrar && (
        <RegistrarModal
          asistente={registrar}
          hoy={hoy}
          onClose={() => setRegistrar(null)}
          onDone={() => {
            setRegistrar(null)
            refrescar()
          }}
        />
      )}

      {historial && (
        <HistorialModal
          asistente={historial}
          isAdmin={isAdmin}
          onClose={() => setHistorial(null)}
          onChanged={() => {
            setHistorial(null)
            refrescar()
          }}
        />
      )}
    </div>
  )
}
