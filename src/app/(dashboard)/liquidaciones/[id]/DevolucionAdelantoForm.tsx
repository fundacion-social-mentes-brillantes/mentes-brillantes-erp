'use client'

import { useActionState, useEffect, useRef } from 'react'
import { saveDevolucionSocio } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { AlertCircle, CheckCircle2, Undo2 } from 'lucide-react'
import { pesos } from '@/lib/utils/pesos'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'
import { OpcionesMedioPago } from '@/components/medios-pago/MediosPago'

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
  const recordarFormulario = useConservarSiFalla(state)
  const formRef = useRef<HTMLFormElement>(null)
  const selectClass =
    "flex h-10 w-full rounded-md border border-linea bg-panel px-3 py-2 text-sm text-tinta ring-offset-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:[color-scheme:dark]"

  // Limpiar el formulario despues de guardar. Va en un efecto: hacerlo
  // durante el render lo repetia en cada render mientras durara el exito.
  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state])

  const conSaldo = socios.filter((s) => s.pendiente > 0)

  if (!conSaldo.length) {
    return (
      <p className="text-sm text-gris">
        Nadie tiene adelantos por devolver en este período.
      </p>
    )
  }

  return (
    <form ref={formRef} onSubmitCapture={recordarFormulario} action={formAction} className="space-y-4">
      {state?.error && (
        <div className="p-3 bg-rojo/10 border border-rojo/30 rounded-lg flex items-start gap-3 text-rojo">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      {state?.success && (
        <div className="p-3 bg-verde/10 border border-verde/30 rounded-lg flex items-start gap-3 text-verde">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">Devolución registrada y repartida entre sus adelantos.</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">¿Quién devolvió? *</label>
        <select name="socio_id" required disabled={isPending} className={selectClass}>
          <option value="">Seleccione...</option>
          {conSaldo.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre} — debe {pesos(s.pendiente)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">¿Cuánto devolvió? *</label>
        <MoneyInput
          name="monto"
          required
          disabled={isPending}
          className="bg-panel text-tinta"
        />
        <p className="text-xs text-gris">
          Se descuenta solo de sus adelantos, empezando por el más antiguo. Puede ser una parte o todo.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Fecha *</label>
        <Input
          name="fecha"
          type="date"
          defaultValue={fechaSugerida}
          min={fechaMinima}
          max={fechaMaxima}
          required
          disabled={isPending}
          className="bg-panel text-tinta dark:[color-scheme:dark]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">¿Cómo devolvió? *</label>
        <select name="metodo_pago" required disabled={isPending} className={selectClass}>
          <OpcionesMedioPago />
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-tinta">Notas</label>
        <Input
          name="notas"
          placeholder="Opcional"
          disabled={isPending}
          className="bg-panel text-tinta"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        <Undo2 className="w-4 h-4" />
        {isPending ? 'Registrando...' : 'Registrar Devolución'}
      </Button>
    </form>
  )
}
