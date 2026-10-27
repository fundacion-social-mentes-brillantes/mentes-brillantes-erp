'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { cambiarEstadoTallerAction } from '../actions'

// Los pasos de un taller, en el orden en que suelen pasar.
const SIGUIENTE: Record<string, Array<{ estado: string; texto: string }>> = {
  borrador: [{ estado: 'abierto', texto: 'Abrir inscripciones' }],
  abierto: [
    { estado: 'cerrado', texto: 'Cerrar inscripciones' },
    { estado: 'realizado', texto: 'Ya se hizo' },
  ],
  cerrado: [
    { estado: 'abierto', texto: 'Reabrir inscripciones' },
    { estado: 'realizado', texto: 'Ya se hizo' },
  ],
  realizado: [],
  cancelado: [],
}

export function EstadoTallerBotones({ tallerId, estado }: { tallerId: string; estado: string }) {
  const [enviando, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const opciones = SIGUIENTE[estado] ?? []
  if (opciones.length === 0) return null

  return (
    <>
      {opciones.map((o, i) => (
        <Button
          key={o.estado}
          size="sm"
          variant={i === 0 ? 'default' : 'outline'}
          disabled={enviando}
          onClick={() => {
            setError(null)
            iniciar(async () => {
              const r = await cambiarEstadoTallerAction(tallerId, o.estado)
              if (r?.error) setError(r.error)
            })
          }}
        >
          {o.texto}
        </Button>
      ))}
      {error && (
        <p className="w-full text-sm text-rojo" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
