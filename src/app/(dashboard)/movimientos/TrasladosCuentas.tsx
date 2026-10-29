'use client'

import { useActionState, useState, useTransition } from 'react'
import { AlertCircle, ArrowRightLeft, CheckCircle2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OpcionesMedioPago } from '@/components/medios-pago/MediosPago'
import { metodoPagoLegible } from '@/lib/utils/textos'
import { pesos } from '@/lib/utils/pesos'
import { anularTrasladoAction, registrarTrasladoAction, type TrasladoState } from './traslados-actions'

export type TrasladoFila = {
  id: string
  fecha: string
  monto: number
  metodo_origen: string
  metodo_destino: string
  notas: string | null
  estado: string
  motivo_anulacion: string | null
}

const claseSelect =
  'flex h-10 w-full rounded-2xl border border-linea bg-panel px-3 py-2 text-sm text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento disabled:cursor-not-allowed disabled:opacity-60 dark:[color-scheme:dark]'

/**
 * Plata que pasa de una cuenta de la fundacion a otra (Nequi → Banco Caja
 * Social, efectivo → banco...). No es ingreso ni gasto: solo cambia lo que hay
 * en cada cuenta en el Resumen por cuenta de la liquidacion.
 */
export function TrasladosCuentas({ traslados, isAdmin, hoy }: { traslados: TrasladoFila[]; isAdmin: boolean; hoy: string }) {
  const [abierto, setAbierto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  // Al guardar bien se cierra el formulario (y con el se van los datos escritos) y queda el aviso.
  const [estado, accion, guardando] = useActionState<TrasladoState, FormData>(async (previo, formData) => {
    const respuesta = await registrarTrasladoAction(previo, formData)
    if (respuesta?.success) {
      setAviso(respuesta.mensaje ?? 'Traslado registrado.')
      setAbierto(false)
    }
    return respuesta
  }, null)

  return (
    <section aria-labelledby="titulo-traslados" className="rounded-2xl border border-linea bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-linea p-4 md:p-5">
        <div className="min-w-0">
          <h2 id="titulo-traslados" className="flex items-center gap-2 text-base font-semibold text-tinta">
            <ArrowRightLeft className="h-4 w-4 text-gris" aria-hidden />
            Traslados entre cuentas
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gris">
            Plata que pasa de una cuenta de la fundación a otra. No es ingreso ni gasto: no cambia la utilidad ni lo de
            los socios, solo lo que hay en cada cuenta.
          </p>
        </div>
        {isAdmin && !abierto && (
          <Button type="button" onClick={() => { setAbierto(true); setAviso(null) }} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            Registrar traslado
          </Button>
        )}
      </div>

      {aviso && (
        <p role="status" className="mx-4 mt-4 flex items-center gap-2 rounded-xl bg-verde/10 px-3 py-2 text-sm font-medium text-verde md:mx-5">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {aviso}
        </p>
      )}

      {isAdmin && abierto && (
        <form action={accion} className="grid gap-4 border-b border-linea p-4 md:grid-cols-2 md:p-5">
          {estado?.error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-rojo/30 bg-rojo/10 p-3 text-sm font-medium text-rojo md:col-span-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {estado.error}
            </p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="traslado-origen" className="text-sm font-medium text-tinta">Sale de</label>
            <select id="traslado-origen" name="origen" required defaultValue="nequi" disabled={guardando} className={claseSelect}>
              <OpcionesMedioPago />
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="traslado-destino" className="text-sm font-medium text-tinta">Llega a</label>
            <select id="traslado-destino" name="destino" required defaultValue="banco_caja_social" disabled={guardando} className={claseSelect}>
              <OpcionesMedioPago />
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="traslado-monto" className="text-sm font-medium text-tinta">Valor</label>
            <Input id="traslado-monto" name="monto" inputMode="numeric" required placeholder="50000" disabled={guardando} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="traslado-fecha" className="text-sm font-medium text-tinta">Fecha</label>
            <Input id="traslado-fecha" name="fecha" type="date" required defaultValue={hoy} max={hoy} disabled={guardando} className="dark:[color-scheme:dark]" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="traslado-notas" className="text-sm font-medium text-tinta">
              Nota <span className="font-normal text-gris">(si quieres)</span>
            </label>
            <Input id="traslado-notas" name="notas" maxLength={300} placeholder="Ej: paso de Nequi a la cuenta del banco" disabled={guardando} />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar traslado'}</Button>
            <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={guardando}>Cancelar</Button>
          </div>
        </form>
      )}

      {traslados.length === 0 ? (
        <p className="p-4 text-sm text-gris md:p-5">Todavía no hay traslados registrados.</p>
      ) : (
        <ul className="divide-y divide-linea">
          {traslados.map((t) => (
            <FilaTraslado key={t.id} traslado={t} isAdmin={isAdmin} />
          ))}
        </ul>
      )}
    </section>
  )
}

function FilaTraslado({ traslado: t, isAdmin }: { traslado: TrasladoFila; isAdmin: boolean }) {
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const anulado = t.estado === 'anulado'

  const confirmar = () =>
    iniciar(async () => {
      const r = await anularTrasladoAction(t.id, motivo)
      if (r?.error) setError(r.error)
      else setAnulando(false)
    })

  return (
    <li className={`flex flex-col gap-2 px-4 py-3 md:px-5 ${anulado ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className={`font-medium text-tinta ${anulado ? 'line-through' : ''}`}>
            {metodoPagoLegible(t.metodo_origen)} → {metodoPagoLegible(t.metodo_destino)}
          </p>
          <p className="text-xs text-gris">
            {t.fecha}
            {t.notas ? ` · ${t.notas}` : ''}
            {anulado ? ` · Anulado${t.motivo_anulacion ? `: ${t.motivo_anulacion}` : ''}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`cifra font-semibold text-tinta ${anulado ? 'line-through' : ''}`}>{pesos(t.monto)}</span>
          {isAdmin && !anulado && !anulando && (
            <button type="button" onClick={() => setAnulando(true)} className="text-sm text-gris underline underline-offset-4 hover:text-rojo">
              Anular
            </button>
          )}
        </div>
      </div>
      {anulando && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Por qué se anula"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué se anula"
            className="max-w-sm"
            disabled={pendiente}
          />
          <Button type="button" variant="destructive" onClick={confirmar} disabled={pendiente}>
            {pendiente ? 'Anulando…' : 'Anular traslado'}
          </Button>
          <button type="button" aria-label="Cancelar" onClick={() => { setAnulando(false); setError(null) }} className="p-2 text-gris hover:text-tinta">
            <X className="h-4 w-4" />
          </button>
          {error && <p role="alert" className="w-full text-sm text-rojo">{error}</p>}
        </div>
      )}
    </li>
  )
}
