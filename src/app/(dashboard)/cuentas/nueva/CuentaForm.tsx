'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { saveCuenta, ActionState } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { SearchableAsistenteSelect } from '@/components/SearchableAsistenteSelect'

type ModalidadCobro = 'normal' | 'cortesia' | 'cubierto_por_otro_proceso'

const selectClassName =
  'flex h-10 w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2 text-sm text-[rgb(var(--text-primary))] ring-offset-[rgb(var(--surface-1))] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[rgb(var(--text-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

export function CuentaForm({ asistentes, asistenteInicial, returnTo }: { asistentes: any[], asistenteInicial?: string, returnTo?: string }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(saveCuenta, null)
  const [tipo, setTipo] = useState<'general' | 'coach'>('general')
  const [modalidadCobro, setModalidadCobro] = useState<ModalidadCobro>('normal')
  const [sesiones, setSesiones] = useState<number>(1)
  const [concepto, setConcepto] = useState('')
  const [valorTotal, setValorTotal] = useState('')
  const [abonoInicial, setAbonoInicial] = useState('')
  const modalidadValorCero = tipo === 'coach' && modalidadCobro !== 'normal'
  const prefijoModalidad = tipo === 'coach'
    ? modalidadCobro === 'cortesia'
      ? '[Cortesia]'
      : modalidadCobro === 'cubierto_por_otro_proceso'
        ? '[Cubierto por otro proceso/familiar]'
        : ''
    : ''
  const conceptoCoachBase = useMemo(() => `Sesión guía coach - ${sesiones || 1} sesiones`, [sesiones])
  const conceptoCoach = useMemo(
    () => prefijoModalidad ? `${prefijoModalidad} ${conceptoCoachBase}` : conceptoCoachBase,
    [conceptoCoachBase, prefijoModalidad]
  )
  const asistenteInicialLimpio = asistenteInicial || ''

  useEffect(() => {
    if (tipo === 'coach') {
      setConcepto(conceptoCoach)
    } else {
      setConcepto('')
    }
  }, [tipo, conceptoCoach])

  useEffect(() => {
    if (tipo !== 'coach') {
      setModalidadCobro('normal')
      setConcepto('')
      setValorTotal('')
      setAbonoInicial('')
    }
  }, [tipo])

  useEffect(() => {
    if (modalidadValorCero) {
      setValorTotal('0')
      setAbonoInicial('')
    }
  }, [modalidadValorCero])

  const seleccionarGeneral = () => {
    setTipo('general')
    setModalidadCobro('normal')
    setConcepto('')
    setValorTotal('')
    setAbonoInicial('')
  }

  const seleccionarCoach = () => {
    setTipo('coach')
  }

  return (
    <form action={formAction} className="space-y-6 w-full max-w-2xl bg-white p-4 md:p-6 rounded-xl border border-zinc-200 shadow-sm">
      {returnTo && returnTo.startsWith('/') && <input type="hidden" name="return_to" value={returnTo} />}
      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-600">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Asistente *</label>
          <SearchableAsistenteSelect asistentes={asistentes} disabled={isPending} initialSelectedId={asistenteInicialLimpio} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Tipo de cuenta *</label>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm text-zinc-700">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="tipo_cuenta_radio"
                value="general"
                checked={tipo === 'general'}
                onChange={seleccionarGeneral}
                disabled={isPending}
              />
              General
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="tipo_cuenta_radio"
                value="coach"
                checked={tipo === 'coach'}
                onChange={seleccionarCoach}
                disabled={isPending}
              />
              Paquete coach
            </label>
          </div>
          <input type="hidden" name="tipo_cuenta" value={tipo} />
        </div>

        {tipo === 'coach' && (
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-zinc-900">Modalidad de cobro</label>
            <select
              name="modalidad_cobro"
              value={modalidadCobro}
              onChange={(e) => {
                const next = e.target.value as ModalidadCobro
                setModalidadCobro(next)
                if (next === 'normal' && valorTotal === '0') setValorTotal('')
              }}
              disabled={isPending}
              className={selectClassName}
            >
              <option value="normal">Normal</option>
              <option value="cortesia">Cortesía</option>
              <option value="cubierto_por_otro_proceso">Cubierto por otro proceso/familiar</option>
            </select>
            {modalidadValorCero ? (
              <p className="text-xs text-zinc-500">
                Esta modalidad se registra con valor total 0, sin abono inicial, y la cuenta queda pagada.
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                Usa normal para paquetes coach cobrados como cualquier cuenta.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Concepto *</label>
          <Input
            name="concepto"
            placeholder="Ej: Tratamiento mensual"
            required
            disabled={isPending}
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
          />
          {tipo === 'coach' && (
            <p className="text-xs text-zinc-500">
              Se autogenera como "{conceptoCoach}", puedes ajustarlo si lo necesitas.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Valor Total ($) *</label>
          <Input
            name="valor_total"
            type="text"
            inputMode="decimal"
            placeholder={modalidadValorCero ? '0' : 'Ej: 90.000'}
            required
            disabled={isPending}
            readOnly={modalidadValorCero}
            value={valorTotal}
            onChange={(e) => setValorTotal(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Fecha de emisión *</label>
          <Input name="fecha_emision" type="date" defaultValue={new Date().toISOString().split('T')[0]} required disabled={isPending} />
        </div>

        {tipo === 'coach' && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900">Sesiones compradas *</label>
              <Input
                name="sesiones_coach"
                type="number"
                min="1"
                required
                value={sesiones}
                onChange={(e) => setSesiones(Math.max(1, Number(e.target.value) || 1))}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-zinc-900">Fecha de sesión coach (opcional)</label>
              <Input
                name="fecha_sesion_coach"
                type="date"
                disabled={isPending}
              />
              <p className="text-xs text-zinc-500">
                Si esta cuenta corresponde a una sesión ya tomada, puedes registrarla aquí. Si no conoces la fecha ahora, déjalo vacío y agrégala después desde el asistente o el detalle de la cuenta.
              </p>
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-zinc-500">
                El valor total es pactado libremente; no se calcula por sesión. El paquete puede tener saldo pendiente aunque todas las sesiones no se hayan usado.
              </p>
            </div>
          </>
        )}

        <div className="space-y-2 pt-4 border-t border-zinc-100 md:col-span-2">
          <h3 className="text-sm font-semibold text-zinc-900">Pago Inicial (Opcional)</h3>
          <p className="text-xs text-zinc-500">
            {modalidadValorCero
              ? 'Las cuentas de valor 0 no admiten abono inicial.'
              : 'Si el asistente realizó un abono en este momento, regístralo aquí.'}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Abono Inicial ($)</label>
          <Input
            name="abono_inicial"
            type="text"
            inputMode="decimal"
            placeholder={modalidadValorCero ? 'No aplica' : 'Ej: 60.000'}
            disabled={isPending || modalidadValorCero}
            value={abonoInicial}
            onChange={(e) => setAbonoInicial(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Método de Pago</label>
          <select
            name="metodo_pago"
            disabled={isPending || modalidadValorCero}
            className={selectClassName}
          >
            <option value="efectivo">Efectivo</option>
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
            <option value="otro">Otro</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 pt-4 border-t border-zinc-100">
        <Link href="/cuentas" className="text-sm font-medium text-center text-zinc-500 hover:text-zinc-900">
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto justify-center">
          {isPending ? 'Guardando...' : 'Crear Cuenta'}
        </Button>
      </div>
    </form>
  )
}
