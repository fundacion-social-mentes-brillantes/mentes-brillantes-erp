import Link from 'next/link'
import { CalendarHeart, Check } from 'lucide-react'
import type { DbClient } from '@/lib/supabase/types'
import { talleresDePersona } from '@/lib/operaciones/talleres'
import { formatearFechaEvento, formatearFechaIso } from '@/lib/utils/fechas'
import { pesos } from '@/lib/utils/pesos'
import { metodoPagoLegible } from '@/lib/utils/textos'
import { ChipEstadoPago } from '../../talleres/piezas'

/**
 * Los talleres de la persona, como registro aparte: a cuales fue, cuanto
 * pago y cuando. A proposito NO suma al resumen financiero ni a su deuda: las
 * cuentas de cada taller se llevan en Talleres.
 */
export async function TalleresDePersona({
  supabase,
  persona,
  className,
}: {
  supabase: DbClient
  persona: { id: string; cedula: string | null }
  className: string
}) {
  const lista = await talleresDePersona(supabase, persona).catch(() => null)

  return (
    <div className={className}>
      <div className="flex items-center gap-2 border-b border-linea px-5 py-4">
        <CalendarHeart className="h-4 w-4 text-gris" />
        <h3 className="text-base font-semibold text-tinta">Talleres</h3>
      </div>
      <div className="space-y-3 p-5">
        {lista === null ? (
          <p className="text-sm text-gris">No se pudieron cargar sus talleres.</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-gris">No ha ido a talleres registrados en el ERP.</p>
        ) : (
          <ul className="space-y-4">
            {lista.map((fila) => (
              <li key={fila.id} className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/talleres/${fila.taller_id}`} prefetch={false} className="font-medium text-tinta hover:text-acento">
                      {fila.taller?.nombre}
                    </Link>
                    <p className="flex items-center gap-1 text-xs text-gris">
                      {formatearFechaEvento(fila.taller?.fecha_inicio, 'Sin fecha', true)}
                      {fila.asistio ? (
                        <span className="inline-flex items-center gap-0.5 text-verde">
                          · <Check className="h-3.5 w-3.5" aria-hidden /> asistió
                        </span>
                      ) : (
                        ' · no figura que haya llegado'
                      )}
                    </p>
                  </div>
                  <ChipEstadoPago estado={fila.estadoPago} />
                </div>
                {fila.pagos.length > 0 && (
                  <ul className="text-xs text-gris">
                    {fila.pagos.map((p) => (
                      <li key={p.id}>
                        Pagó <span className="cifra font-semibold text-verde">{pesos(p.monto)}</span> el {formatearFechaIso(p.fecha)} ·{' '}
                        {metodoPagoLegible(p.metodo_pago)}
                      </li>
                      ))}
                    </ul>
                  )}
                  {fila.pendiente > 0 && (
                    <p className="text-xs font-semibold text-ambar">Le faltan {pesos(fila.pendiente)} de este taller</p>
                  )}
                </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gris">Es solo un registro: no suma a su deuda ni a su resumen financiero.</p>
      </div>
    </div>
  )
}
