'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { saveCuenta } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { SearchableAsistenteSelect } from '@/components/SearchableAsistenteSelect'

export function CuentaForm({ asistentes, asistenteInicial }: { asistentes: any[], asistenteInicial?: string }) {
  const [state, formAction, isPending] = useActionState(saveCuenta, null)
  const [tipo, setTipo] = useState<'general' | 'coach'>('general')
  const [sesiones, setSesiones] = useState<number>(1)
  const [concepto, setConcepto] = useState('')
  const conceptoCoach = useMemo(() => `Sesión guía coach - ${sesiones || 1} sesiones`, [sesiones])
  const asistenteInicialLimpio = asistenteInicial || ''

  useEffect(() => {
    if (tipo === 'coach') {
      setConcepto(conceptoCoach)
    } else {
      setConcepto('')
    }
  }, [tipo, conceptoCoach])

  return (
    <form action={formAction} className="space-y-6 max-w-2xl bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-600">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Asistente *</label>
          <SearchableAsistenteSelect asistentes={asistentes} disabled={isPending} initialSelectedId={asistenteInicialLimpio} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Tipo de cuenta *</label>
          <div className="flex gap-4 text-sm text-zinc-700">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="tipo_cuenta_radio"
                value="general"
                checked={tipo === 'general'}
                onChange={() => setTipo('general')}
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
                onChange={() => setTipo('coach')}
                disabled={isPending}
              />
              Paquete coach
            </label>
          </div>
          <input type="hidden" name="tipo_cuenta" value={tipo} />
        </div>
        
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
              Se autogenera como “{conceptoCoach}”, puedes ajustarlo si lo necesitas.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Valor Total ($) *</label>
          <Input name="valor_total" type="number" step="0.01" min="0.01" required disabled={isPending} />
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
          <p className="text-xs text-zinc-500">Si el asistente realizó un abono en este momento, regístralo aquí.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Abono Inicial ($)</label>
          <Input name="abono_inicial" type="number" step="0.01" min="0" placeholder="0.00" disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Método de Pago</label>
          <select 
            name="metodo_pago" 
            disabled={isPending}
            className="flex h-10 w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2 text-sm text-[rgb(var(--text-primary))] ring-offset-[rgb(var(--surface-1))] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[rgb(var(--text-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="efectivo">Efectivo</option>
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
            <option value="otro">Otro</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pt-4 border-t border-zinc-100">
        <Link href="/cuentas" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando...' : 'Crear Cuenta'}
        </Button>
      </div>
    </form>
  )
}




