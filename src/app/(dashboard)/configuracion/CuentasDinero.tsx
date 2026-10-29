'use client'

import { useActionState, useState, useTransition } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Eye, EyeOff, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MedioPago } from '@/lib/medios-pago'
import {
  cambiarCuentaDineroActiva,
  crearCuentaDinero,
  moverCuentaDinero,
  renombrarCuentaDinero,
  type CuentaDineroState,
} from './cuentas-dinero-actions'

/**
 * Las cuentas de dinero de la fundación (efectivo, Nequi, Banco Caja Social...).
 * Cambiar el nombre u ocultar una cuenta no toca ningún pago: cada pago guarda
 * la cuenta por dentro con una clave fija.
 */
export function CuentasDinero({ medios }: { medios: MedioPago[] }) {
  const [aviso, setAviso] = useState<CuentaDineroState>(null)
  // React vacia solo el campo del formulario cuando la cuenta se agrega bien.
  const [, crear, creando] = useActionState<CuentaDineroState, FormData>(async (previo, formData) => {
    const respuesta = await crearCuentaDinero(previo, formData)
    setAviso(respuesta)
    return respuesta
  }, null)

  return (
    <div className="space-y-4">
      {aviso?.mensaje && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-verde/10 px-3 py-2 text-sm font-medium text-verde">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          {aviso.mensaje}
        </p>
      )}
      {aviso?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rojo/30 bg-rojo/10 px-3 py-2 text-sm font-medium text-rojo">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {aviso.error}
        </p>
      )}

      <ul className="divide-y divide-linea rounded-2xl border border-linea">
        {medios.map((m, i) => (
          <FilaCuenta key={`${m.clave}:${m.nombre}`} medio={m} primera={i === 0} ultima={i === medios.length - 1} alTerminar={setAviso} />
        ))}
      </ul>

      <form action={crear} className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1.5">
          <label htmlFor="cuenta-nueva" className="text-sm font-medium text-tinta">Agregar una cuenta</label>
          <Input id="cuenta-nueva" name="nombre" maxLength={60} placeholder="Ej: Bancolombia" required disabled={creando} />
        </div>
        <Button type="submit" disabled={creando} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden />
          {creando ? 'Agregando…' : 'Agregar'}
        </Button>
      </form>
    </div>
  )
}

function FilaCuenta({
  medio,
  primera,
  ultima,
  alTerminar,
}: {
  medio: MedioPago
  primera: boolean
  ultima: boolean
  alTerminar: (estado: CuentaDineroState) => void
}) {
  const [nombre, setNombre] = useState(medio.nombre)
  const [pendiente, iniciar] = useTransition()
  const cambiado = nombre.trim() !== medio.nombre

  const correr = (accion: () => Promise<CuentaDineroState>) =>
    iniciar(async () => {
      alTerminar(await accion())
    })

  return (
    <li className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${medio.activo ? '' : 'bg-suave/60'}`}>
      <div className="flex flex-col">
        <button
          type="button"
          aria-label={`Subir ${medio.nombre}`}
          disabled={primera || pendiente}
          onClick={() => correr(() => moverCuentaDinero(medio.clave, 'arriba'))}
          className="rounded p-0.5 text-gris hover:text-tinta disabled:opacity-30"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Bajar ${medio.nombre}`}
          disabled={ultima || pendiente}
          onClick={() => correr(() => moverCuentaDinero(medio.clave, 'abajo'))}
          className="rounded p-0.5 text-gris hover:text-tinta disabled:opacity-30"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <Input
        aria-label={`Nombre de la cuenta ${medio.nombre}`}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        maxLength={60}
        disabled={pendiente}
        className="h-9 min-w-40 flex-1"
      />
      {cambiado && (
        <Button type="button" size="sm" disabled={pendiente} onClick={() => correr(() => renombrarCuentaDinero(medio.clave, nombre))}>
          Guardar nombre
        </Button>
      )}
      {!medio.activo && <span className="rounded-full bg-suave-2 px-2 py-0.5 text-xs font-medium text-gris">Oculta</span>}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pendiente}
        onClick={() => correr(() => cambiarCuentaDineroActiva(medio.clave, !medio.activo))}
        className="gap-1.5"
      >
        {medio.activo ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
        {medio.activo ? 'Ocultar' : 'Mostrar'}
      </Button>
    </li>
  )
}
