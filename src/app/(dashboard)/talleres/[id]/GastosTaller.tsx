'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatearFechaIso } from '@/lib/utils/fechas'
import { pesos } from '@/lib/utils/pesos'
import { metodoPagoLegible } from '@/lib/utils/textos'
import { anularMovimientoTallerAction } from '../actions'
import { FormularioGasto } from './formularios'

export type GastoFila = {
  id: string
  concepto: string
  monto: number
  categoria: string | null
  metodo_pago: string | null
  fecha: string
  estado: string | null
  notas: string | null
}

/** Los gastos del taller. Cada uno es un egreso de la fundacion marcado con el taller. */
export function GastosTaller({ tallerId, nombreTaller, gastos, hoy }: { tallerId: string; nombreTaller: string; gastos: GastoFila[]; hoy: string }) {
  const [agregando, setAgregando] = useState(gastos.length === 0)
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null)
  const [enviando, iniciar] = useTransition()
  // El concepto se guarda como "Taller · Refrigerios" para que se entienda en Egresos; aqui sobra el nombre.
  const prefijo = `${nombreTaller} · `
  const sinPrefijo = (concepto: string) => (concepto.startsWith(prefijo) ? concepto.slice(prefijo.length) : concepto)
  const anulado = (g: GastoFila) => g.estado === 'anulado' || String(g.notas ?? '').includes('[ANULADO]')

  const anular = (gasto: GastoFila) => {
    if (!window.confirm(`¿Anular el gasto «${sinPrefijo(gasto.concepto)}» de ${pesos(gasto.monto)}?`)) return
    setAviso(null)
    iniciar(async () => {
      const r = await anularMovimientoTallerAction(tallerId, 'egreso', gasto.id)
      setAviso(r?.error ? { texto: r.error, error: true } : { texto: 'Gasto anulado.' })
    })
  }

  return (
    <div className="space-y-4">
      {aviso && (
        <p
          className={`rounded-xl px-4 py-2.5 text-sm font-medium ${aviso.error ? 'border border-rojo/30 bg-rojo/10 text-rojo' : 'bg-verde/12 text-verde'}`}
          role={aviso.error ? 'alert' : 'status'}
        >
          {aviso.texto}
        </p>
      )}

      {agregando ? (
        <section className="rounded-2xl border border-linea bg-panel p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-tinta">Registrar gasto</h2>
              <p className="text-sm text-gris">Sale de la fundación como un egreso, marcado con este taller.</p>
            </div>
            {gastos.length > 0 && (
              <button type="button" onClick={() => setAgregando(false)} className="text-sm font-medium text-gris hover:text-tinta">
                Cerrar
              </button>
            )}
          </div>
          <FormularioGasto
            tallerId={tallerId}
            hoy={hoy}
            alTerminar={(m) => {
              setAgregando(false)
              setAviso({ texto: m ?? 'Gasto registrado.' })
            }}
          />
        </section>
      ) : (
        <Button onClick={() => setAgregando(true)}>
          <Plus className="h-4 w-4" />
          Registrar gasto
        </Button>
      )}

      {gastos.length > 0 && (
        <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-panel">
          {gastos.map((gasto) => (
            <li key={gasto.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${anulado(gasto) ? 'opacity-60' : ''}`}>
              <div className="min-w-0">
                <p className={`font-medium text-tinta ${anulado(gasto) ? 'line-through' : ''}`}>{sinPrefijo(gasto.concepto)}</p>
                <p className="text-xs text-gris">
                  {formatearFechaIso(gasto.fecha)} · {gasto.categoria || 'Sin categoría'} · {metodoPagoLegible(gasto.metodo_pago)}
                  {anulado(gasto) ? ' · Anulado' : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`cifra font-semibold ${anulado(gasto) ? 'text-gris line-through' : 'text-rojo'}`}>{pesos(gasto.monto)}</span>
                {!anulado(gasto) && (
                  <button
                    type="button"
                    onClick={() => anular(gasto)}
                    disabled={enviando}
                    className="rounded-md px-2 py-1 text-xs font-medium text-gris hover:bg-rojo/10 hover:text-rojo disabled:opacity-50"
                  >
                    Anular
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
