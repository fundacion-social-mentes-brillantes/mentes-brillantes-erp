'use client'

import { useActionState, useEffect, useRef } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'
import { pesos } from '@/lib/utils/pesos'
import type { PreguntaTaller } from '@/lib/operaciones/talleres-reglas'
import {
  editarInscripcionAction,
  inscribirAction,
  registrarGastoTallerAction,
  registrarPagoTallerAction,
  type TallerState,
} from '../actions'
import { claseArea, claseEtiqueta, claseSelect } from '../piezas'
import { OpcionesMedioPago } from '@/components/medios-pago/MediosPago'

// Formularios de la pagina de un taller. Todos avisan con `alTerminar` cuando
// la accion salio bien, para que quien los abrio los cierre.

function Aviso({ estado }: { estado: TallerState }) {
  if (!estado?.error) return null
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rojo/30 bg-rojo/10 p-3 text-rojo" role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-sm font-medium">{estado.error}</p>
    </div>
  )
}

/** Llama `alTerminar` una sola vez por cada respuesta exitosa. */
function useAlTerminar(estado: TallerState, alTerminar?: (mensaje?: string) => void) {
  const ultimo = useRef<TallerState>(null)
  useEffect(() => {
    if (estado && estado !== ultimo.current && estado.success) {
      ultimo.current = estado
      alTerminar?.(estado.mensaje)
    }
  }, [estado, alTerminar])
}

/** Metodo de pago y fecha. Con `prefijo` ("pago_") los campos se llaman pago_metodo y pago_fecha. */
function CamposMetodoYFecha({ hoy, deshabilitado, metodo = 'nequi', prefijo = '' }: { hoy: string; deshabilitado: boolean; metodo?: string; prefijo?: string }) {
  const nombreMetodo = prefijo ? `${prefijo}metodo` : 'metodo_pago'
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor={`${prefijo}metodo`} className={claseEtiqueta}>
          Cómo pagó
        </label>
        <select id={`${prefijo}metodo`} name={nombreMetodo} defaultValue={metodo} className={claseSelect} disabled={deshabilitado}>
          <OpcionesMedioPago actual={metodo} />
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${prefijo}fecha`} className={claseEtiqueta}>
          Fecha
        </label>
        <Input id={`${prefijo}fecha`} name={`${prefijo}fecha`} type="date" defaultValue={hoy} max={hoy} className="dark:[color-scheme:dark]" disabled={deshabilitado} />
      </div>
    </>
  )
}

export function FormularioPago({
  tallerId,
  inscripcionId,
  pendiente,
  hoy,
  alTerminar,
  alCancelar,
}: {
  tallerId: string
  inscripcionId: string
  pendiente: number
  hoy: string
  alTerminar?: (mensaje?: string) => void
  alCancelar?: () => void
}) {
  const [estado, accion, enviando] = useActionState(registrarPagoTallerAction.bind(null, tallerId, inscripcionId), null)
  const recordar = useConservarSiFalla(estado)
  useAlTerminar(estado, alTerminar)

  return (
    <form action={accion} onSubmitCapture={recordar} className="space-y-3">
      <Aviso estado={estado} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor={`monto-${inscripcionId}`} className={claseEtiqueta}>
            Monto
          </label>
          <MoneyInput id={`monto-${inscripcionId}`} name="monto" defaultValue={pendiente} required disabled={enviando} />
          <p className="text-xs text-gris">Falta {pesos(pendiente)}</p>
        </div>
        <CamposMetodoYFecha hoy={hoy} deshabilitado={enviando} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {alCancelar && (
          <button type="button" onClick={alCancelar} className="text-sm font-medium text-gris hover:text-tinta">
            Cancelar
          </button>
        )}
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Registrando…' : 'Registrar pago'}
        </Button>
      </div>
    </form>
  )
}

function CampoPregunta({ pregunta, deshabilitado }: { pregunta: PreguntaTaller; deshabilitado: boolean }) {
  const nombre = `respuesta_${pregunta.id}`
  const etiqueta = (
    <span className={claseEtiqueta}>
      {pregunta.texto}
      {pregunta.obligatoria && <span className="text-gris"> (en la invitación es obligatoria)</span>}
    </span>
  )
  if (pregunta.tipo === 'texto') {
    return (
      <label className="block space-y-1.5">
        {etiqueta}
        <Input name={nombre} maxLength={2000} disabled={deshabilitado} />
      </label>
    )
  }
  const opciones = pregunta.tipo === 'si_no' ? [{ valor: 'si', nombre: 'Sí' }, { valor: 'no', nombre: 'No' }] : (pregunta.opciones ?? []).map((o) => ({ valor: o, nombre: o }))
  return (
    <label className="block space-y-1.5">
      {etiqueta}
      <select name={nombre} defaultValue="" className={claseSelect} disabled={deshabilitado}>
        <option value="">Sin responder</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.nombre}
          </option>
        ))}
      </select>
    </label>
  )
}

export function FormularioInscripcion({
  tallerId,
  precio,
  preguntas,
  hoy,
  isAdmin,
  enLaPuerta = false,
  alTerminar,
  alCancelar,
}: {
  tallerId: string
  precio: number
  preguntas: PreguntaTaller[]
  hoy: string
  isAdmin: boolean
  enLaPuerta?: boolean
  alTerminar?: (mensaje?: string) => void
  alCancelar?: () => void
}) {
  const [estado, accion, enviando] = useActionState(inscribirAction.bind(null, tallerId), null)
  const recordar = useConservarSiFalla(estado)
  useAlTerminar(estado, alTerminar)

  return (
    <form action={accion} onSubmitCapture={recordar} className="space-y-4">
      <Aviso estado={estado} />
      <input type="hidden" name="origen" value={enLaPuerta ? 'puerta' : 'manual'} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 sm:col-span-2">
          <span className={claseEtiqueta}>Nombre completo *</span>
          <Input name="nombre" required maxLength={120} autoComplete="off" disabled={enviando} />
        </label>
        <label className="block space-y-1.5">
          <span className={claseEtiqueta}>Cédula</span>
          <Input name="documento" inputMode="numeric" maxLength={30} autoComplete="off" disabled={enviando} />
        </label>
        <label className="block space-y-1.5">
          <span className={claseEtiqueta}>Celular</span>
          <Input name="telefono" type="tel" inputMode="tel" maxLength={30} autoComplete="off" disabled={enviando} />
        </label>
        <label className="block space-y-1.5">
          <span className={claseEtiqueta}>Correo</span>
          <Input name="correo" type="email" maxLength={160} autoComplete="off" disabled={enviando} />
        </label>
        {isAdmin ? (
          <label className="block space-y-1.5">
            <span className={claseEtiqueta}>Valor a pagar</span>
            <MoneyInput name="valor_acordado" defaultValue={precio} disabled={enviando} />
            <span className="block text-xs text-gris">Bájalo si tiene descuento; 0 si es cortesía.</span>
          </label>
        ) : (
          <div className="space-y-1.5">
            <span className={claseEtiqueta}>Valor a pagar</span>
            <p className="flex h-10 items-center text-sm text-tinta">{precio > 0 ? pesos(precio) : 'Gratis'}</p>
          </div>
        )}
      </div>

      {preguntas.length > 0 && (
        <div className="grid grid-cols-1 gap-3 border-t border-linea pt-4 sm:grid-cols-2">
          {preguntas.map((p) => (
            <CampoPregunta key={p.id} pregunta={p} deshabilitado={enviando} />
          ))}
        </div>
      )}

      {precio > 0 && (
        <div className="space-y-3 border-t border-linea pt-4">
          <p className="text-sm text-gris">¿Ya pagó algo? Escríbelo y queda registrado de una vez (si no, déjalo vacío).</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block space-y-1.5">
              <span className={claseEtiqueta}>Pagó</span>
              <MoneyInput name="pago_monto" disabled={enviando} />
            </label>
            <CamposMetodoYFecha hoy={hoy} deshabilitado={enviando} prefijo="pago_" />
          </div>
        </div>
      )}

      {!enLaPuerta && (
        <label className="flex items-center gap-2 text-sm text-tinta">
          <input type="checkbox" name="asistio" className="h-4 w-4 accent-[rgb(var(--acento))]" disabled={enviando} />
          Ya llegó al taller
        </label>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {alCancelar && (
          <button type="button" onClick={alCancelar} className="text-sm font-medium text-gris hover:text-tinta">
            Cancelar
          </button>
        )}
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : enLaPuerta ? 'Inscribir y marcar que llegó' : 'Inscribir'}
        </Button>
      </div>
    </form>
  )
}

export type DatosEditables = {
  id: string
  nombre: string
  documento: string | null
  telefono: string | null
  correo: string | null
  notas: string | null
  valor_acordado: number
}

export function FormularioEditarInscripcion({
  tallerId,
  inscripcion,
  isAdmin,
  alTerminar,
  alCancelar,
}: {
  tallerId: string
  inscripcion: DatosEditables
  isAdmin: boolean
  alTerminar?: (mensaje?: string) => void
  alCancelar?: () => void
}) {
  const [estado, accion, enviando] = useActionState(editarInscripcionAction.bind(null, tallerId, inscripcion.id), null)
  const recordar = useConservarSiFalla(estado)
  useAlTerminar(estado, alTerminar)

  return (
    <form action={accion} onSubmitCapture={recordar} className="space-y-3">
      <Aviso estado={estado} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 sm:col-span-2">
          <span className={claseEtiqueta}>Nombre completo *</span>
          <Input name="nombre" required maxLength={120} defaultValue={inscripcion.nombre} disabled={enviando} />
        </label>
        <label className="block space-y-1.5">
          <span className={claseEtiqueta}>Cédula</span>
          <Input name="documento" inputMode="numeric" maxLength={30} defaultValue={inscripcion.documento ?? ''} disabled={enviando} />
        </label>
        <label className="block space-y-1.5">
          <span className={claseEtiqueta}>Celular</span>
          <Input name="telefono" type="tel" maxLength={30} defaultValue={inscripcion.telefono ?? ''} disabled={enviando} />
        </label>
        <label className="block space-y-1.5">
          <span className={claseEtiqueta}>Correo</span>
          <Input name="correo" type="email" maxLength={160} defaultValue={inscripcion.correo ?? ''} disabled={enviando} />
        </label>
        {isAdmin && (
          <label className="block space-y-1.5">
            <span className={claseEtiqueta}>Valor a pagar</span>
            <MoneyInput name="valor_acordado" defaultValue={inscripcion.valor_acordado} disabled={enviando} />
          </label>
        )}
        <label className="block space-y-1.5 sm:col-span-2">
          <span className={claseEtiqueta}>Notas</span>
          <textarea name="notas" maxLength={1000} defaultValue={inscripcion.notas ?? ''} className={`${claseArea} min-h-16`} disabled={enviando} />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {alCancelar && (
          <button type="button" onClick={alCancelar} className="text-sm font-medium text-gris hover:text-tinta">
            Cancelar
          </button>
        )}
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}

export const CATEGORIAS_GASTO = [
  { valor: 'Honorarios', nombre: 'Honorarios (tallerista externo)' },
  { valor: 'Insumos', nombre: 'Insumos y materiales' },
  { valor: 'Operativo', nombre: 'Operativo (refrigerios, transporte…)' },
  { valor: 'Servicios', nombre: 'Servicios (salón, sonido…)' },
  { valor: 'Administrativo', nombre: 'Administrativo' },
  { valor: 'Otros', nombre: 'Otros' },
] as const

export function FormularioGasto({ tallerId, hoy, alTerminar }: { tallerId: string; hoy: string; alTerminar?: (mensaje?: string) => void }) {
  const [estado, accion, enviando] = useActionState(registrarGastoTallerAction.bind(null, tallerId), null)
  const recordar = useConservarSiFalla(estado)
  useAlTerminar(estado, alTerminar)

  return (
    <form action={accion} onSubmitCapture={recordar} className="space-y-3">
      <Aviso estado={estado} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 sm:col-span-2">
          <span className={claseEtiqueta}>En qué se gastó *</span>
          <Input name="concepto" required maxLength={200} placeholder="Refrigerios, materiales, pago a la tallerista…" disabled={enviando} />
        </label>
        <label className="block space-y-1.5">
          <span className={claseEtiqueta}>Monto *</span>
          <MoneyInput name="monto" required disabled={enviando} />
        </label>
        <label className="block space-y-1.5">
          <span className={claseEtiqueta}>Categoría *</span>
          <select name="categoria" required defaultValue="" className={claseSelect} disabled={enviando}>
            <option value="" disabled>
              Escoge…
            </option>
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <CamposMetodoYFecha hoy={hoy} deshabilitado={enviando} metodo="efectivo" />
        <label className="block space-y-1.5 sm:col-span-2">
          <span className={claseEtiqueta}>Notas</span>
          <Input name="notas" maxLength={1000} disabled={enviando} />
        </label>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Registrar gasto'}
        </Button>
      </div>
    </form>
  )
}
