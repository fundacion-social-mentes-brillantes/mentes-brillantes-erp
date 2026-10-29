'use client'

import { useActionState, useState } from 'react'
import { saveCuenta, ActionState } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { SearchableAsistenteSelect } from '@/components/SearchableAsistenteSelect'
import type { AsistenteOpcion } from '@/components/SearchableAsistenteSelect'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'
import { OpcionesMedioPago } from '@/components/medios-pago/MediosPago'

type ModalidadCobro = 'normal' | 'cortesia' | 'cubierto_por_otro_proceso'

const selectClassName =
  'flex h-10 w-full rounded-md border border-linea bg-suave px-3 py-2 text-sm text-tinta ring-offset-panel file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gris focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

const PREFIJO_MODALIDAD: Record<ModalidadCobro, string> = {
  normal: '',
  cortesia: '[Cortesia]',
  cubierto_por_otro_proceso: '[Cubierto por otro proceso/familiar]',
}

/** El concepto que se propone para un paquete coach. */
const conceptoCoachPara = (sesiones: number, modalidad: ModalidadCobro) => {
  const base = `Sesión guía coach - ${sesiones || 1} sesiones`
  return PREFIJO_MODALIDAD[modalidad] ? `${PREFIJO_MODALIDAD[modalidad]} ${base}` : base
}

const parsePositiveMoney = (value: string) => {
  const cleaned = value.trim().replace(/\s+/g, '').replace(/\$/g, '')
  if (!cleaned) return 0
  const normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function CuentaForm({ asistentes, asistenteInicial, returnTo }: { asistentes: AsistenteOpcion[], asistenteInicial?: string, returnTo?: string }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(saveCuenta, null)
  const recordarFormulario = useConservarSiFalla(state)
  const [tipo, setTipo] = useState<'general' | 'coach'>('general')
  const [modalidadCobro, setModalidadCobro] = useState<ModalidadCobro>('normal')
  const [sesiones, setSesiones] = useState<number>(1)
  const [concepto, setConcepto] = useState('')
  const [valorTotal, setValorTotal] = useState('')
  const [abonoInicial, setAbonoInicial] = useState('')
  const modalidadValorCero = tipo === 'coach' && modalidadCobro !== 'normal'
  const abonoInicialMayorACero = parsePositiveMoney(abonoInicial) > 0
  const asistenteInicialLimpio = asistenteInicial || ''

  // Los campos que dependen del tipo, la modalidad o las sesiones se ajustan en
  // el mismo cambio que los provoca (antes eran efectos encadenados que
  // re-dibujaban el formulario varias veces por cada clic).

  const seleccionarGeneral = () => {
    setTipo('general')
    setModalidadCobro('normal')
    setConcepto('')
    setValorTotal('')
    setAbonoInicial('')
  }

  const seleccionarCoach = () => {
    setTipo('coach')
    setConcepto(conceptoCoachPara(sesiones, modalidadCobro))
  }

  const cambiarModalidad = (next: ModalidadCobro) => {
    setModalidadCobro(next)
    setConcepto(conceptoCoachPara(sesiones, next))
    if (next === 'normal') {
      if (valorTotal === '0') setValorTotal('')
    } else {
      // Cortesia o cubierto por otro: va en 0 y sin abono.
      setValorTotal('0')
      setAbonoInicial('')
    }
  }

  const cambiarSesiones = (valor: string) => {
    const n = Math.max(1, Number(valor) || 1)
    setSesiones(n)
    setConcepto(conceptoCoachPara(n, modalidadCobro))
  }

  return (
    <form onSubmitCapture={recordarFormulario} action={formAction} className="space-y-6 w-full max-w-2xl bg-panel p-4 md:p-6 rounded-xl border border-linea">
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
      {state?.error && (
        <div className="p-3 bg-rojo/10 border border-rojo/30 rounded-lg flex items-start gap-3 text-rojo">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-tinta">Asistente *</label>
          <SearchableAsistenteSelect asistentes={asistentes} disabled={isPending} initialSelectedId={asistenteInicialLimpio} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-tinta">Tipo de cuenta *</label>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm text-tinta">
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
            <label className="text-sm font-medium text-tinta">Modalidad de cobro</label>
            <select
              name="modalidad_cobro"
              value={modalidadCobro}
              onChange={(e) => cambiarModalidad(e.target.value as ModalidadCobro)}
              disabled={isPending}
              className={selectClassName}
            >
              <option value="normal">Normal</option>
              <option value="cortesia">Cortesía</option>
              <option value="cubierto_por_otro_proceso">Cubierto por otro proceso/familiar</option>
            </select>
            {modalidadValorCero ? (
              <p className="text-xs text-gris">
                Esta modalidad se registra con valor total 0, sin abono inicial, y la cuenta queda pagada.
              </p>
            ) : (
              <p className="text-xs text-gris">
                Usa normal para paquetes coach cobrados como cualquier cuenta.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-tinta">Concepto *</label>
          <Input
            name="concepto"
            placeholder="Ej: Tratamiento mensual"
            required
            disabled={isPending}
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
          />
          {tipo === 'coach' && (
            <p className="text-xs text-gris">
              Se autogenera como &ldquo;{conceptoCoachPara(sesiones, modalidadCobro)}&rdquo;, puedes ajustarlo si lo necesitas.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Valor Total ($) *</label>
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
          <label className="text-sm font-medium text-tinta">Fecha de emisión *</label>
          <Input name="fecha_emision" type="date" defaultValue={new Date().toISOString().split('T')[0]} required disabled={isPending} />
        </div>

        {tipo === 'coach' && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-tinta">Sesiones compradas *</label>
              <Input
                name="sesiones_coach"
                type="number"
                min="1"
                required
                value={sesiones}
                onChange={(e) => cambiarSesiones(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-tinta">Fecha de sesión coach (opcional)</label>
              <Input
                name="fecha_sesion_coach"
                type="date"
                disabled={isPending}
              />
              <p className="text-xs text-gris">
                Si esta cuenta corresponde a una sesión ya tomada, puedes registrarla aquí. Si no conoces la fecha ahora, déjalo vacío y agrégala después desde el asistente o el detalle de la cuenta.
              </p>
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-gris">
                El valor total es pactado libremente; no se calcula por sesión. El paquete puede tener saldo pendiente aunque todas las sesiones no se hayan usado.
              </p>
            </div>
          </>
        )}

        <div className="space-y-2 pt-4 border-t border-linea md:col-span-2">
          <h3 className="text-sm font-semibold text-tinta">Pago Inicial (Opcional)</h3>
          <p className="text-xs text-gris">
            {modalidadValorCero
              ? 'Las cuentas de valor 0 no admiten abono inicial.'
              : 'Si el asistente realizó un abono en este momento, regístralo aquí.'}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Abono Inicial ($)</label>
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
          <label className="text-sm font-medium text-tinta">Fecha de pago inicial</label>
          <Input
            name="fecha_pago_inicial"
            type="date"
            defaultValue={new Date().toISOString().split('T')[0]}
            required={abonoInicialMayorACero && !modalidadValorCero}
            disabled={isPending || modalidadValorCero}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-tinta">Método de Pago</label>
          <select
            name="metodo_pago"
            disabled={isPending || modalidadValorCero}
            className={selectClassName}
          >
            <OpcionesMedioPago />
          </select>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 pt-4 border-t border-linea">
        <Link href="/cuentas" className="text-sm font-medium text-center text-gris hover:text-tinta">
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto justify-center">
          {isPending ? 'Guardando...' : 'Crear Cuenta'}
        </Button>
      </div>
    </form>
  )
}
