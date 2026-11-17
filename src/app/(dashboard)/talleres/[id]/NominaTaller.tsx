'use client'

import { useActionState, useState, useTransition } from 'react'
import { AlertCircle, HandCoins, Plus, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { OpcionesMedioPago } from '@/components/medios-pago/MediosPago'
import { formatearFechaIso } from '@/lib/utils/fechas'
import { pesos } from '@/lib/utils/pesos'
import { metodoPagoLegible } from '@/lib/utils/textos'
import type { AdelantoTaller, NominaTaller as Nomina, RepartoTaller } from '@/lib/operaciones/talleres-nomina'
import {
  anularRepartoTallerAction,
  crearAdelantoTallerAction,
  quitarAdelantoTallerAction,
  repartirTallerAction,
  type TallerState,
} from '../actions'
import { claseEtiqueta, claseSelect } from '../piezas'

// La nomina del taller (solo admin): la plata de los talleres va aparte de la
// fundacion. Lo recaudado menos los gastos se reparte entre los socios activos
// con sus porcentajes; repartir solo se anota (la plata se entrega por fuera).
// Si despues llegan pagos, vuelve a quedar algo por repartir.

export type NominaVista = Pick<
  Nomina,
  'recaudado' | 'gastos' | 'repartido' | 'porRepartir' | 'porCobrar' | 'conDeuda' | 'socios' | 'propuesta' | 'repartos' | 'adelantos' | 'adelantosPendientes'
>

function Aviso({ estado }: { estado: TallerState }) {
  if (!estado) return null
  return estado.error ? (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-rojo/30 bg-rojo/10 px-4 py-2.5 text-sm font-medium text-rojo">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {estado.error}
    </p>
  ) : estado.mensaje ? (
    <p role="status" className="rounded-xl bg-verde/12 px-4 py-2.5 text-sm font-medium text-verde">
      {estado.mensaje}
    </p>
  ) : null
}

export function NominaTaller({ tallerId, nomina, hoy }: { tallerId: string; nomina: NominaVista; hoy: string }) {
  const [repartiendo, setRepartiendo] = useState(false)
  const [dandoAdelanto, setDandoAdelanto] = useState(false)
  const [aviso, setAviso] = useState<TallerState>(null)
  const [estadoReparto, accionReparto, guardandoReparto] = useActionState(async (prev: TallerState, formData: FormData) => {
    const r = await repartirTallerAction(tallerId, prev, formData)
    if (r?.success) {
      setRepartiendo(false)
      setAviso(r)
    }
    return r
  }, null)
  const [estadoAdelanto, accionAdelanto, guardandoAdelanto] = useActionState(async (prev: TallerState, formData: FormData) => {
    const r = await crearAdelantoTallerAction(tallerId, prev, formData)
    if (r?.success) {
      setDandoAdelanto(false)
      setAviso(r)
    }
    return r
  }, null)

  const hayPorRepartir = nomina.porRepartir > 0
  const cifras = [
    { titulo: 'Recaudado', valor: pesos(nomina.recaudado), color: 'text-verde', nota: 'pagos del taller' },
    { titulo: 'Gastos', valor: pesos(nomina.gastos), color: nomina.gastos > 0 ? 'text-rojo' : 'text-tinta', nota: 'del taller' },
    { titulo: 'Ya repartido', valor: pesos(nomina.repartido), color: 'text-tinta', nota: `${nomina.repartos.filter((r) => r.estado === 'activo').length} reparto(s)` },
    {
      titulo: 'Por repartir',
      valor: pesos(nomina.porRepartir),
      color: nomina.porRepartir > 0 ? 'text-acento' : nomina.porRepartir < 0 ? 'text-rojo' : 'text-tinta',
      nota: nomina.porCobrar > 0 ? `faltan ${pesos(nomina.porCobrar)} por cobrar` : 'todo cobrado',
    },
  ]

  return (
    <div className="space-y-4">
      <p className="rounded-2xl border border-linea bg-suave/60 px-4 py-3 text-sm text-gris">
        La plata de este taller va aparte de la fundación: no entra a la liquidación de los socios. Aquí se reparte, con
        los mismos porcentajes, cuando lo decidas (al cerrar el taller, y otra vez si después llegan pagos). Repartir solo
        se anota: la plata se entrega por fuera.
      </p>

      <Aviso estado={aviso} />

      <section aria-label="Cuentas del taller" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-linea bg-panel lg:grid-cols-4">
        {cifras.map((c, i) => (
          <div
            key={c.titulo}
            className={`p-4 md:p-5 ${i % 2 === 1 ? 'border-l border-linea' : ''} ${i >= 2 ? 'border-t border-linea lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
          >
            <p className="text-sm text-gris">{c.titulo}</p>
            <p className={`cifra mt-1 text-xl font-bold md:text-2xl ${c.color}`}>{c.valor}</p>
            <p className="mt-0.5 text-xs text-gris">{c.nota}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-linea bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linea p-4 md:p-5">
          <div>
            <h2 className="text-base font-semibold text-tinta">{hayPorRepartir ? 'Lo que le toca a cada socio' : 'Reparto'}</h2>
            <p className="text-sm text-gris">
              {hayPorRepartir
                ? `De los ${pesos(nomina.porRepartir)} que quedan por repartir, menos lo que se le adelantó a cada uno a cuenta de este taller.`
                : nomina.porRepartir < 0
                  ? 'Los gastos y lo repartido superan lo recaudado: no hay nada para repartir.'
                  : 'No hay nada por repartir. Si llegan más pagos, aquí aparecerá lo nuevo.'}
            </p>
          </div>
          {hayPorRepartir && !repartiendo && (
            <Button onClick={() => setRepartiendo(true)}>
              <HandCoins className="h-4 w-4" />
              Repartir {pesos(nomina.porRepartir)}
            </Button>
          )}
        </div>
        {hayPorRepartir && (
          <TablaSocios
            filas={nomina.propuesta.map((f) => ({ ...f, nombre: f.nombre }))}
            total={nomina.porRepartir}
          />
        )}
        {repartiendo && (
          <form action={accionReparto} className="space-y-3 border-t border-linea p-4 md:p-5">
            <Aviso estado={estadoReparto?.error ? estadoReparto : null} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className={claseEtiqueta}>Fecha del reparto</span>
                <Input name="fecha" type="date" defaultValue={hoy} className="dark:[color-scheme:dark]" disabled={guardandoReparto} />
              </label>
              <label className="block space-y-1.5">
                <span className={claseEtiqueta}>
                  Nota <span className="font-normal text-gris">(si quieres)</span>
                </span>
                <Input name="notas" maxLength={500} placeholder="Ej: cierre de la cena" disabled={guardandoReparto} />
              </label>
            </div>
            <p className="text-sm text-gris">Queda anotado lo que le toca a cada socio. Si te equivocas, se puede anular.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={guardandoReparto}>
                {guardandoReparto ? 'Repartiendo…' : `Sí, repartir ${pesos(nomina.porRepartir)}`}
              </Button>
              <Button type="button" variant="outline" onClick={() => setRepartiendo(false)} disabled={guardandoReparto}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </section>

      <AdelantosTaller
        tallerId={tallerId}
        adelantos={nomina.adelantos}
        pendientes={nomina.adelantosPendientes}
        socios={nomina.socios}
        hoy={hoy}
        dando={dandoAdelanto}
        setDando={setDandoAdelanto}
        accion={accionAdelanto}
        estado={estadoAdelanto}
        guardando={guardandoAdelanto}
        alAvisar={setAviso}
      />

      {nomina.repartos.length > 0 && (
        <section className="rounded-2xl border border-linea bg-panel">
          <h2 className="border-b border-linea p-4 text-base font-semibold text-tinta md:p-5">Repartos hechos</h2>
          <ul className="divide-y divide-linea">
            {[...nomina.repartos].reverse().map((r) => (
              <FilaReparto key={r.id} tallerId={tallerId} reparto={r} alAvisar={setAviso} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function TablaSocios({
  filas,
  total,
}: {
  filas: Array<{ socioId: string; nombre: string; porcentaje: number; valor: number; adelantos: number; neto: number }>
  total?: number
}) {
  const hayAdelantos = filas.some((f) => f.adelantos > 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="text-left text-xs text-gris">
          <tr className="border-b border-linea">
            <th className="px-4 py-2.5 font-medium md:px-5">Socio</th>
            <th className="px-4 py-2.5 text-right font-medium">%</th>
            <th className="px-4 py-2.5 text-right font-medium">Su parte</th>
            {hayAdelantos && <th className="px-4 py-2.5 text-right font-medium">Adelantos</th>}
            <th className="px-4 py-2.5 text-right font-medium md:px-5">A entregar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-linea">
          {filas.map((f) => (
            <tr key={f.socioId}>
              <td className="px-4 py-2.5 font-medium text-tinta md:px-5">{f.nombre}</td>
              <td className="cifra px-4 py-2.5 text-right text-gris">{f.porcentaje}%</td>
              <td className="cifra px-4 py-2.5 text-right text-tinta">{pesos(f.valor)}</td>
              {hayAdelantos && <td className="cifra px-4 py-2.5 text-right text-ambar">{f.adelantos > 0 ? `− ${pesos(f.adelantos)}` : '—'}</td>}
              <td className={`cifra px-4 py-2.5 text-right font-semibold md:px-5 ${f.neto < 0 ? 'text-rojo' : 'text-tinta'}`}>{pesos(f.neto)}</td>
            </tr>
          ))}
        </tbody>
        {total !== undefined && (
          <tfoot>
            <tr className="border-t border-linea bg-suave/60 font-semibold">
              <td className="px-4 py-2.5 md:px-5">Total</td>
              <td />
              <td className="cifra px-4 py-2.5 text-right">{pesos(total)}</td>
              {hayAdelantos && <td className="cifra px-4 py-2.5 text-right text-ambar">− {pesos(filas.reduce((t, f) => t + f.adelantos, 0))}</td>}
              <td className="cifra px-4 py-2.5 text-right md:px-5">{pesos(filas.reduce((t, f) => t + f.neto, 0))}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function FilaReparto({ tallerId, reparto, alAvisar }: { tallerId: string; reparto: RepartoTaller; alAvisar: (e: TallerState) => void }) {
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [pendiente, iniciar] = useTransition()
  const anulado = reparto.estado === 'anulado'

  const confirmar = () =>
    iniciar(async () => {
      const r = await anularRepartoTallerAction(tallerId, reparto.id, motivo)
      alAvisar(r)
      if (r?.success) setAnulando(false)
    })

  return (
    <li className={anulado ? 'opacity-60' : ''}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
        <div>
          <p className={`font-semibold text-tinta ${anulado ? 'line-through' : ''}`}>
            {pesos(reparto.utilidad)} · {formatearFechaIso(reparto.fecha)}
          </p>
          <p className="text-xs text-gris">
            {reparto.notas ? `${reparto.notas} · ` : ''}
            {anulado ? `Anulado${reparto.motivoAnulacion ? `: ${reparto.motivoAnulacion}` : ''}` : 'Anotado'}
          </p>
        </div>
        {!anulado && !anulando && (
          <button type="button" onClick={() => setAnulando(true)} className="inline-flex items-center gap-1.5 text-sm text-gris underline underline-offset-4 hover:text-rojo">
            <Undo2 className="h-4 w-4" aria-hidden />
            Anular
          </button>
        )}
      </div>
      {!anulado && <TablaSocios filas={reparto.socios} />}
      {anulando && (
        <div className="flex flex-wrap items-center gap-2 border-t border-linea px-4 py-3 md:px-5">
          <Input aria-label="Por qué se anula" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se anula" className="max-w-sm" disabled={pendiente} />
          <Button type="button" variant="destructive" onClick={confirmar} disabled={pendiente}>
            {pendiente ? 'Anulando…' : 'Anular reparto'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setAnulando(false)} disabled={pendiente}>
            Cancelar
          </Button>
        </div>
      )}
    </li>
  )
}

function AdelantosTaller({
  tallerId,
  adelantos,
  pendientes,
  socios,
  hoy,
  dando,
  setDando,
  accion,
  estado,
  guardando,
  alAvisar,
}: {
  tallerId: string
  adelantos: AdelantoTaller[]
  pendientes: Record<string, number>
  socios: NominaVista['socios']
  hoy: string
  dando: boolean
  setDando: (v: boolean) => void
  accion: (formData: FormData) => void
  estado: TallerState
  guardando: boolean
  alAvisar: (e: TallerState) => void
}) {
  const [quitando, iniciar] = useTransition()
  // Cuanto queda sin descontar de cada socio, para saber cuales adelantos todavia se pueden quitar.
  const restante: Record<string, number> = { ...pendientes }
  const sePuedeQuitar = new Set<string>()
  for (const a of [...adelantos].reverse()) {
    if ((restante[a.socioId] ?? 0) >= a.monto - 0.005) {
      sePuedeQuitar.add(a.id)
      restante[a.socioId] = (restante[a.socioId] ?? 0) - a.monto
    }
  }

  const quitar = (a: AdelantoTaller) => {
    if (!window.confirm(`¿Quitar el adelanto de ${pesos(a.monto)} a ${a.nombre}?`)) return
    iniciar(async () => alAvisar(await quitarAdelantoTallerAction(tallerId, a.id)))
  }

  return (
    <section className="rounded-2xl border border-linea bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linea p-4 md:p-5">
        <div>
          <h2 className="text-base font-semibold text-tinta">Adelantos a cuenta de este taller</h2>
          <p className="text-sm text-gris">Se le descuentan al socio en el próximo reparto de este taller, no en la liquidación de la fundación.</p>
        </div>
        {!dando && (
          <Button variant="outline" onClick={() => setDando(true)}>
            <Plus className="h-4 w-4" />
            Dar adelanto
          </Button>
        )}
      </div>
      {dando && (
        <form action={accion} className="space-y-3 border-b border-linea p-4 md:p-5">
          <Aviso estado={estado?.error ? estado : null} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className={claseEtiqueta}>Socio</span>
              <select name="socio_id" required defaultValue="" className={claseSelect} disabled={guardando}>
                <option value="" disabled>
                  Escoge
                </option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className={claseEtiqueta}>Valor</span>
              <MoneyInput name="monto" required disabled={guardando} />
            </label>
            <label className="block space-y-1.5">
              <span className={claseEtiqueta}>De qué cuenta sale</span>
              <select name="metodo_pago" defaultValue="nequi" className={claseSelect} disabled={guardando}>
                <OpcionesMedioPago actual="nequi" />
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className={claseEtiqueta}>Fecha</span>
              <Input name="fecha" type="date" defaultValue={hoy} max={hoy} className="dark:[color-scheme:dark]" disabled={guardando} />
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <span className={claseEtiqueta}>
                Nota <span className="font-normal text-gris">(si quieres)</span>
              </span>
              <Input name="notas" maxLength={300} disabled={guardando} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar adelanto'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setDando(false)} disabled={guardando}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {adelantos.length === 0 ? (
        <p className="p-4 text-sm text-gris md:p-5">No hay adelantos a cuenta de este taller.</p>
      ) : (
        <ul className="divide-y divide-linea">
          {adelantos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-5">
              <div>
                <p className="font-medium text-tinta">
                  {a.nombre} · <span className="cifra">{pesos(a.monto)}</span>
                </p>
                <p className="text-xs text-gris">
                  {formatearFechaIso(a.fecha)} · {metodoPagoLegible(a.metodoPago)}
                  {a.notas ? ` · ${a.notas}` : ''}
                  {sePuedeQuitar.has(a.id) ? ' · por descontar' : ' · ya descontado'}
                </p>
              </div>
              {sePuedeQuitar.has(a.id) && (
                <button type="button" onClick={() => quitar(a)} disabled={quitando} className="text-sm text-gris underline underline-offset-4 hover:text-rojo disabled:opacity-50">
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
