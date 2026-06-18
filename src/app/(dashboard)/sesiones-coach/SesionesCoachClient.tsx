'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CalendarPlus, History, X, HeartHandshake, CheckCircle2 } from 'lucide-react'
import { registrarSesionCoachAsistente, editarSesion, eliminarSesion } from '@/app/(dashboard)/coach/actions'
import { estadoCoach } from '@/lib/utils/coach'
import { coincideBusqueda } from '@/lib/utils/busqueda'

type Sesion = { id: string; fecha: string; notas?: string | null }
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
  disponible: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ultima: 'bg-amber-100 text-amber-700 border-amber-200',
  agotado: 'bg-zinc-200 text-zinc-600 border-zinc-300',
}
const ESTADO_DOT: Record<string, string> = {
  disponible: 'bg-emerald-500',
  ultima: 'bg-amber-500',
  agotado: 'bg-zinc-400',
}
const ESTADO_TEXTO: Record<string, string> = {
  disponible: 'Disponible',
  ultima: 'Última sesión',
  agotado: 'Sin sesiones',
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="absolute inset-0" onClick={onClose} aria-label="Cerrar" />
      <div className="relative w-full sm:max-w-lg bg-[rgb(var(--surface-1))] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[rgb(var(--border))] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--border))] sticky top-0 bg-[rgb(var(--surface-1))]">
          <h3 className="font-semibold text-[rgb(var(--text-primary))]">{title}</h3>
          <button onClick={onClose} className="text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))]" aria-label="Cerrar">
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
          <p className="text-lg font-semibold text-[rgb(var(--text-primary))]">{asistente.nombre}</p>
          {asistente.codigo && <p className="text-xs text-[rgb(var(--text-muted))]">Código {asistente.codigo}</p>}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-2">
            <p className="text-[11px] text-[rgb(var(--text-muted))]">Compradas</p>
            <p className="text-lg font-bold text-[rgb(var(--text-primary))]">{asistente.compradas}</p>
          </div>
          <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-2">
            <p className="text-[11px] text-[rgb(var(--text-muted))]">Tomadas</p>
            <p className="text-lg font-bold text-emerald-600">{asistente.realizadas}</p>
          </div>
          <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-2">
            <p className="text-[11px] text-[rgb(var(--text-muted))]">Restantes</p>
            <p className="text-lg font-bold text-[rgb(var(--warning))]">{asistente.restantes}</p>
          </div>
        </div>

        {sinCupo ? (
          <p className="rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-sm px-3 py-2">
            Este asistente no tiene sesiones disponibles. No se puede registrar una nueva sesión.
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Fecha de la sesión</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full h-10 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 text-sm text-[rgb(var(--text-primary))]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Notas (opcional)</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                placeholder="Observaciones breves"
                className="w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 py-2 text-sm text-[rgb(var(--text-primary))]"
              />
            </div>
          </>
        )}

        {error && <p className="text-sm text-[rgb(var(--danger))] bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-2))] rounded-md">
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={sinCupo || isPending}
            className="px-4 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] bg-[rgb(var(--accent))] hover:bg-[rgb(var(--accent-strong))] rounded-md disabled:opacity-50"
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
          <p className="text-lg font-semibold text-[rgb(var(--text-primary))]">{asistente.nombre}</p>
          <p className="text-xs text-[rgb(var(--text-muted))]">
            {asistente.realizadas} de {asistente.compradas} tomadas · {asistente.restantes} restantes
          </p>
        </div>

        {error && <p className="text-sm text-[rgb(var(--danger))] bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

        {asistente.sesiones.length === 0 ? (
          <p className="text-sm text-[rgb(var(--text-muted))] py-6 text-center">Aún no hay sesiones registradas.</p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border))] border border-[rgb(var(--border))] rounded-lg overflow-hidden">
            {asistente.sesiones.map((s) => (
              <li key={s.id} className="p-3 text-sm">
                {editId === s.id ? (
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={editFecha}
                      onChange={(e) => setEditFecha(e.target.value)}
                      className="w-full h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-2 text-sm text-[rgb(var(--text-primary))]"
                    />
                    <textarea
                      value={editNotas}
                      onChange={(e) => setEditNotas(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-2 py-1 text-sm text-[rgb(var(--text-primary))]"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditId(null)} className="text-xs text-[rgb(var(--text-muted))] hover:underline">Cancelar</button>
                      <button
                        onClick={() => guardarEdicion(s.id)}
                        disabled={isPending}
                        className="text-xs font-medium text-[rgb(var(--accent-foreground))] bg-[rgb(var(--accent))] hover:bg-[rgb(var(--accent-strong))] rounded-md px-3 py-1 disabled:opacity-50"
                      >
                        {isPending ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[rgb(var(--text-primary))]">{fmtFecha(s.fecha)}</p>
                      <p className="text-[rgb(var(--text-muted))] text-xs truncate">{s.notas || 'Sin notas'}</p>
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
                          className="text-xs text-[rgb(var(--info))] hover:underline"
                        >
                          Editar
                        </button>
                        <button onClick={() => eliminar(s.id)} disabled={isPending} className="text-xs text-[rgb(var(--danger))] hover:underline disabled:opacity-50">
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
      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        filtro === value
          ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] border-[rgb(var(--accent))]'
          : 'bg-[rgb(var(--surface-1))] text-[rgb(var(--text-muted))] border-[rgb(var(--border))] hover:text-[rgb(var(--text-primary))]'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[rgba(var(--gold),0.34)] bg-[rgba(var(--surface-1),0.6)] text-[rgb(var(--warning))]">
          <HeartHandshake className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--text-primary))]">Sesiones Coach</h1>
          <p className="text-[rgb(var(--text-muted))] text-sm">Sesiones de guía coach por asistente: compradas, tomadas y restantes.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-[rgb(var(--text-muted))]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, código o cédula..."
            className="h-10 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] pl-9 pr-4 text-sm text-[rgb(var(--text-primary))] outline-none focus:border-[rgb(var(--accent))]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filtroBtn('todos', 'Todos')}
          {filtroBtn('pendientes', 'Con pendientes')}
          {filtroBtn('sin', 'Sin restantes')}
        </div>
      </div>

      <p className="text-xs text-[rgb(var(--text-muted))]">{filtrados.length} asistente(s) con paquete coach</p>

      {filtrados.length === 0 ? (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] p-10 text-center text-sm text-[rgb(var(--text-muted))]">
          No hay asistentes que coincidan con la búsqueda o el filtro.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((a) => {
            const estado = estadoCoach(a.restantes)
            return (
              <div key={a.asistenteId} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] p-4 shadow-sm flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[rgb(var(--text-primary))] truncate">{a.nombre}</p>
                    <p className="text-xs text-[rgb(var(--text-muted))]">{a.codigo ? `Código ${a.codigo}` : 'Sin código'}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border ${ESTADO_BADGE[estado]}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${ESTADO_DOT[estado]}`} />
                    {ESTADO_TEXTO[estado]}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[11px] text-[rgb(var(--text-muted))]">Compradas</p>
                    <p className="text-xl font-bold text-[rgb(var(--text-primary))]">{a.compradas}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[rgb(var(--text-muted))]">Tomadas</p>
                    <p className="text-xl font-bold text-emerald-600">{a.realizadas}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[rgb(var(--text-muted))]">Restantes</p>
                    <p className={`text-xl font-bold ${estado === 'agotado' ? 'text-zinc-500' : 'text-[rgb(var(--warning))]'}`}>{a.restantes}</p>
                  </div>
                </div>

                <p className="text-xs text-[rgb(var(--text-muted))] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Última sesión: {fmtFecha(a.ultimaSesion)}
                </p>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setRegistrar(a)}
                    disabled={a.restantes <= 0}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] px-3 py-2 text-sm font-medium hover:bg-[rgb(var(--accent-strong))] disabled:opacity-50"
                    title={a.restantes <= 0 ? 'Sin sesiones disponibles' : 'Registrar sesión'}
                  >
                    <CalendarPlus className="w-4 h-4" />
                    Registrar
                  </button>
                  <button
                    onClick={() => setHistorial(a)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--surface-2))]"
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
