'use client'

import { useActionState, useRef } from 'react'
import { saveDevolucionSocio } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2, Undo2 } from 'lucide-react'

type SocioConSaldo = { id: string; nombre: string; pendiente: number }

/**
 * Registra que un socio devolvio plata de sus adelantos. Se pone UN valor —lo
 * que pago— y el ERP lo reparte entre sus adelantos pendientes, del mas viejo
 * al mas nuevo. Casi nunca hay un solo adelanto: hay varios chiquitos y un
 * pago que los cubre en parte o del todo, y hacer esa cuenta a mano es donde
 * se cometen los errores.
 */
export function DevolucionAdelantoForm({
  periodoId,
  socios,
  fechaMinima,
  fechaMaxima,
  fechaSugerida,
}: {
  periodoId: string
  socios: SocioConSaldo[]
  fechaMinima: string
  fechaMaxima: string
  fechaSugerida: string
}) {
  const actionWithId = saveDevolucionSocio.bind(null, periodoId)
  const [state, formAction, isPending] = useActionState(actionWithId, null)
  const formRef = useRef<HTMLFormElement>(null)
  const selectClass =
    "flex h-10 w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 py-2 text-sm text-[rgb(var(--text-primary))] ring-offset-[rgb(var(--surface-1))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:[color-scheme:dark]"

  if (state?.success && formRef.current) {
    formRef.current.reset()
  }

  const conSaldo = socios.filter((s) => s.pendiente > 0)

  if (!conSaldo.length) {
    return (
      <p className="text-sm text-zinc-500">
        Nadie tiene adelantos por devolver en este período.
      </p>
    )
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-600">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      {state?.success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3 text-emerald-700">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">Devolución registrada y repartida entre sus adelantos.</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-[rgb(var(--text-primary))]">¿Quién devolvió? *</label>
        <select name="socio_id" required disabled={isPending} className={selectClass}>
          <option value="">Seleccione...</option>
          {conSaldo.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre} — debe ${s.pendiente.toLocaleString('es-CO')}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[rgb(var(--text-primary))]">¿Cuánto devolvió? *</label>
        <Input
          name="monto"
          type="number"
          step="0.01"
          min="0.01"
          required
          disabled={isPending}
          className="bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))]"
        />
        <p className="text-xs text-zinc-500">
          Se descuenta solo de sus adelantos, empezando por el más antiguo. Puede ser una parte o todo.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Fecha *</label>
        <Input
          name="fecha"
          type="date"
          defaultValue={fechaSugerida}
          min={fechaMinima}
          max={fechaMaxima}
          required
          disabled={isPending}
          className="bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))] dark:[color-scheme:dark]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[rgb(var(--text-primary))]">¿Cómo devolvió? *</label>
        <select name="metodo_pago" required disabled={isPending} className={selectClass}>
          <option value="efectivo">Efectivo</option>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[rgb(var(--text-primary))]">Notas</label>
        <Input
          name="notas"
          placeholder="Opcional"
          disabled={isPending}
          className="bg-[rgb(var(--input-bg))] text-[rgb(var(--text-primary))]"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        <Undo2 className="w-4 h-4" />
        {isPending ? 'Registrando...' : 'Registrar Devolución'}
      </Button>
    </form>
  )
}
