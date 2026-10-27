'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { useConservarSiFalla } from '@/lib/hooks/use-conservar-si-falla'
import { valorFechaHoraLocal } from '@/lib/utils/fechas'
import {
  ESTADOS_TALLER,
  ETIQUETA_ESTADO_TALLER,
  slugDesdeNombre,
  type PreguntaTaller,
  type Taller,
  type TipoPregunta,
} from '@/lib/operaciones/talleres-reglas'
import { crearTallerAction, editarTallerAction } from './actions'
import { claseArea, claseEtiqueta, claseSelect } from './piezas'

const TIPOS_SUGERIDOS = ['Taller', 'Encuentro', 'Retiro', 'Charla', 'Conversatorio', 'Celebración']

const NOMBRE_TIPO_PREGUNTA: Record<TipoPregunta, string> = {
  texto: 'Respuesta escrita',
  opciones: 'Escoger una opción',
  si_no: 'Sí o no',
}

type PreguntaEnEdicion = PreguntaTaller & { opcionesTexto: string }

let contador = 0
const nuevoId = () => `p${Date.now().toString(36)}${(contador++).toString(36)}`

export function TallerForm({ taller, preguntas = [] }: { taller?: Taller | null; preguntas?: PreguntaTaller[] }) {
  const accion = taller?.id ? editarTallerAction.bind(null, taller.id) : crearTallerAction
  const [estado, formAction, enviando] = useActionState(accion, null)
  const recordarFormulario = useConservarSiFalla(estado)

  const [nombre, setNombre] = useState(taller?.nombre ?? '')
  const [slug, setSlug] = useState(taller?.slug ?? '')
  const [slugTocado, setSlugTocado] = useState(Boolean(taller?.slug))
  const [lista, setLista] = useState<PreguntaEnEdicion[]>(() =>
    preguntas.map((p) => ({ ...p, opcionesTexto: (p.opciones ?? []).join('\n') }))
  )

  const slugMostrado = slugTocado ? slug : slugDesdeNombre(nombre)

  const cambiar = (i: number, cambios: Partial<PreguntaEnEdicion>) =>
    setLista((actual) => actual.map((p, j) => (j === i ? { ...p, ...cambios } : p)))
  const mover = (i: number, paso: -1 | 1) =>
    setLista((actual) => {
      const j = i + paso
      if (j < 0 || j >= actual.length) return actual
      const copia = [...actual]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })

  const preguntasJson = JSON.stringify(
    lista.map((p) => ({
      id: p.id,
      texto: p.texto,
      tipo: p.tipo,
      obligatoria: p.obligatoria,
      ...(p.tipo === 'opciones' ? { opciones: p.opcionesTexto.split('\n').map((o) => o.trim()).filter(Boolean) } : {}),
    }))
  )

  return (
    <form
      onSubmitCapture={recordarFormulario}
      action={formAction}
      className="max-w-3xl space-y-6 rounded-2xl border border-linea bg-panel p-5 text-tinta md:p-6"
    >
      {estado?.error && (
        <div className="flex items-start gap-3 rounded-xl border border-rojo/30 bg-rojo/10 p-3 text-rojo" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{estado.error}</p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="nombre" className={claseEtiqueta}>
            Nombre *
          </label>
          <Input
            id="nombre"
            name="nombre"
            required
            maxLength={120}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Encuentro de la Gratitud 2026"
            disabled={enviando}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="tipo" className={claseEtiqueta}>
            Tipo
          </label>
          <Input id="tipo" name="tipo" list="tipos-taller" defaultValue={taller?.tipo ?? 'Taller'} maxLength={40} disabled={enviando} />
          <datalist id="tipos-taller">
            {TIPOS_SUGERIDOS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        <div className="space-y-2">
          <label htmlFor="estado" className={claseEtiqueta}>
            Estado
          </label>
          <select id="estado" name="estado" defaultValue={taller?.estado ?? 'borrador'} className={claseSelect} disabled={enviando}>
            {ESTADOS_TALLER.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_TALLER[e]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="fecha_inicio" className={claseEtiqueta}>
            Fecha y hora
          </label>
          <Input
            id="fecha_inicio"
            name="fecha_inicio"
            type="datetime-local"
            defaultValue={valorFechaHoraLocal(taller?.fecha_inicio)}
            className="dark:[color-scheme:dark]"
            disabled={enviando}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="lugar" className={claseEtiqueta}>
            Lugar
          </label>
          <Input id="lugar" name="lugar" defaultValue={taller?.lugar ?? ''} maxLength={200} placeholder="Sede, Bogotá" disabled={enviando} />
        </div>

        <div className="space-y-2">
          <label htmlFor="precio" className={claseEtiqueta}>
            Valor por persona
          </label>
          <MoneyInput id="precio" name="precio" defaultValue={taller?.precio ?? ''} disabled={enviando} />
          <p className="text-xs text-gris">Déjalo en 0 si es gratis. Cambiarlo no toca a quienes ya se inscribieron.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="cupo" className={claseEtiqueta}>
            Cupo
          </label>
          <Input
            id="cupo"
            name="cupo"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            defaultValue={taller?.cupo ?? ''}
            placeholder="Sin límite"
            disabled={enviando}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="descripcion" className={claseEtiqueta}>
            De qué se trata
          </label>
          <textarea
            id="descripcion"
            name="descripcion"
            defaultValue={taller?.descripcion ?? ''}
            maxLength={4000}
            className={claseArea}
            placeholder="Una mañana para agradecer y cerrar el año en círculo. Trae ropa blanca."
            disabled={enviando}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="instrucciones_pago" className={claseEtiqueta}>
            Cómo pagar
          </label>
          <textarea
            id="instrucciones_pago"
            name="instrucciones_pago"
            defaultValue={taller?.instrucciones_pago ?? ''}
            maxLength={2000}
            className={claseArea}
            placeholder="Nequi de la fundación, a nombre de…"
            disabled={enviando}
          />
          <p className="text-xs text-gris">Es lo que verá la persona en la invitación al inscribirse.</p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="slug" className={claseEtiqueta}>
            Enlace de la invitación
          </label>
          <div className="flex items-center overflow-hidden rounded-2xl border border-linea bg-suave focus-within:border-acento">
            <span className="shrink-0 pl-3 text-sm text-gris">talleres.gimnasioemocionalmb.com/</span>
            <input
              id="slug"
              name="slug"
              value={slugMostrado}
              onChange={(e) => {
                setSlugTocado(true)
                setSlug(e.target.value.toLowerCase())
              }}
              maxLength={60}
              className="h-10 min-w-0 flex-1 bg-panel px-2 text-sm text-tinta outline-none"
              disabled={enviando}
            />
          </div>
          {taller?.slug && (
            <p className="text-xs text-gris">Si ya mandaste el enlace, no lo cambies: el anterior dejaría de servir.</p>
          )}
        </div>
      </section>

      <section className="space-y-3 border-t border-linea pt-5">
        <div>
          <h2 className="text-base font-semibold text-tinta">Preguntas propias del formulario</h2>
          <p className="text-sm text-gris">
            Siempre se piden nombre, cédula, celular y correo. Aquí agregas lo que este taller necesite saber.
          </p>
        </div>

        {lista.length > 0 && (
          <ol className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea">
            {lista.map((p, i) => (
              <li key={p.id} className="space-y-3 bg-panel p-4">
                <div className="flex items-start gap-2">
                  <span className="mt-2.5 w-5 shrink-0 text-sm font-semibold text-gris">{i + 1}.</span>
                  <Input
                    aria-label={`Pregunta ${i + 1}`}
                    value={p.texto}
                    onChange={(e) => cambiar(i, { texto: e.target.value })}
                    placeholder="¿Vienes con acompañante?"
                    maxLength={300}
                    disabled={enviando}
                  />
                  <div className="flex shrink-0 items-center">
                    <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="grid h-10 w-9 place-items-center rounded-lg text-gris hover:bg-suave hover:text-tinta disabled:opacity-30" aria-label="Subir pregunta">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => mover(i, 1)} disabled={i === lista.length - 1} className="grid h-10 w-9 place-items-center rounded-lg text-gris hover:bg-suave hover:text-tinta disabled:opacity-30" aria-label="Bajar pregunta">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setLista((actual) => actual.filter((_, j) => j !== i))} className="grid h-10 w-9 place-items-center rounded-lg text-gris hover:bg-rojo/10 hover:text-rojo" aria-label="Quitar pregunta">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 pl-7">
                  <select
                    aria-label="Tipo de respuesta"
                    value={p.tipo}
                    onChange={(e) => cambiar(i, { tipo: e.target.value as TipoPregunta })}
                    className={`${claseSelect} w-auto`}
                    disabled={enviando}
                  >
                    {(Object.keys(NOMBRE_TIPO_PREGUNTA) as TipoPregunta[]).map((t) => (
                      <option key={t} value={t}>
                        {NOMBRE_TIPO_PREGUNTA[t]}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-tinta">
                    <input
                      type="checkbox"
                      checked={p.obligatoria}
                      onChange={(e) => cambiar(i, { obligatoria: e.target.checked })}
                      className="h-4 w-4 accent-[rgb(var(--acento))]"
                      disabled={enviando}
                    />
                    Obligatoria
                  </label>
                </div>
                {p.tipo === 'opciones' && (
                  <div className="pl-7">
                    <textarea
                      aria-label="Opciones, una por renglón"
                      value={p.opcionesTexto}
                      onChange={(e) => cambiar(i, { opcionesTexto: e.target.value })}
                      className={`${claseArea} min-h-20`}
                      placeholder={'Una opción por renglón\nS\nM\nL'}
                      disabled={enviando}
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => setLista((actual) => [...actual, { id: nuevoId(), texto: '', tipo: 'texto', obligatoria: false, opcionesTexto: '' }])}
          disabled={enviando || lista.length >= 20}
        >
          <Plus className="h-4 w-4" />
          Agregar pregunta
        </Button>
        <input type="hidden" name="preguntas" value={preguntasJson} />
      </section>

      <div className="flex items-center justify-end gap-4 border-t border-linea pt-4">
        <Link href={taller?.id ? `/talleres/${taller.id}` : '/talleres'} className="text-sm font-medium text-gris hover:text-tinta">
          Cancelar
        </Link>
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : taller?.id ? 'Guardar cambios' : 'Crear taller'}
        </Button>
      </div>
    </form>
  )
}
