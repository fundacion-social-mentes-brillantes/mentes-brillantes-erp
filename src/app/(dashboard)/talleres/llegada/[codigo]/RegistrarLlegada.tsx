'use client'

import { useState, useTransition } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatearHora } from '@/lib/utils/fechas'
import { registrarLlegadaQrAction } from '../../actions'

// El boton de la pagina de una entrada: registra la llegada y dice como va la
// puerta (cuantos llegaron de cuantos).

export function RegistrarLlegada({
  codigo,
  tallerId,
  cancelada,
  yaLlego,
  horaLlegada,
}: {
  codigo: string
  tallerId: string
  cancelada: boolean
  yaLlego: boolean
  horaLlegada: string | null
}) {
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ hora: string | null; llegaron: number; total: number; yaHabia: boolean } | null>(null)

  if (cancelada) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm font-semibold text-rojo" role="alert">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Esta inscripción está cancelada: no tiene entrada.
      </p>
    )
  }

  if (hecho || yaLlego) {
    const hora = hecho ? hecho.hora : horaLlegada
    const nueva = hecho && !hecho.yaHabia
    return (
      <div className={`rounded-xl px-4 py-3 ${nueva ? 'bg-verde/12' : 'bg-ambar/12'}`} role="status">
        <p className={`flex items-center gap-2 font-semibold ${nueva ? 'text-verde' : 'text-ambar'}`}>
          <CircleCheck className="h-5 w-5" aria-hidden />
          {nueva ? 'Llegada registrada' : 'Ya había llegado'}
          {hora ? ` · ${formatearHora(hora)}` : ''}
        </p>
        {hecho && (
          <p className="mt-1 text-sm text-tinta">
            Llegaron <span className="cifra font-bold">{hecho.llegaron}</span> de {hecho.total}.
          </p>
        )}
      </div>
    )
  }

  const registrar = () => {
    setError(null)
    iniciar(async () => {
      try {
        const r = await registrarLlegadaQrAction(tallerId, codigo)
        if (!r.llegada) {
          setError(r.error ?? 'No se pudo registrar la llegada.')
          return
        }
        setHecho({ hora: r.llegada.horaLlegada, llegaron: r.llegada.llegaron, total: r.llegada.total, yaHabia: r.llegada.yaHabiaLlegado })
      } catch {
        setError('Sin conexión: no se registró. Vuelve a intentarlo.')
      }
    })
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-xl border border-rojo/30 bg-rojo/10 px-4 py-2.5 text-sm font-medium text-rojo" role="alert">
          {error}
        </p>
      )}
      <Button className="h-14 w-full text-lg" onClick={registrar} disabled={pendiente}>
        <CircleCheck className="h-5 w-5" />
        {pendiente ? 'Registrando…' : 'Registrar llegada'}
      </Button>
    </div>
  )
}
