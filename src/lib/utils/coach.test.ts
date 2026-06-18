import { describe, it, expect } from 'vitest'
import { resumenCoach, paqueteDestino, estadoCoach, type CoachPaquete } from './coach'

const paquete = (over: Partial<CoachPaquete> = {}): CoachPaquete => ({
  id: 'paq',
  sesiones_compradas: 10,
  creado_en: '2026-01-01T00:00:00Z',
  coach_sesiones: [],
  ...over,
})

const sesiones = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }))

describe('resumenCoach', () => {
  it('asistente con 0 sesiones tomadas', () => {
    expect(resumenCoach([paquete({ sesiones_compradas: 10, coach_sesiones: [] })])).toEqual({
      compradas: 10,
      realizadas: 0,
      restantes: 10,
    })
  })

  it('asistente con sesiones parcialmente tomadas', () => {
    expect(resumenCoach([paquete({ sesiones_compradas: 10, coach_sesiones: sesiones(4) })])).toEqual({
      compradas: 10,
      realizadas: 4,
      restantes: 6,
    })
  })

  it('asistente sin sesiones restantes', () => {
    expect(resumenCoach([paquete({ sesiones_compradas: 4, coach_sesiones: sesiones(4) })])).toEqual({
      compradas: 4,
      realizadas: 4,
      restantes: 0,
    })
  })

  it('restantes nunca es negativo aunque haya mas tomadas que compradas', () => {
    expect(resumenCoach([paquete({ sesiones_compradas: 2, coach_sesiones: sesiones(5) })]).restantes).toBe(0)
  })

  it('asistente con multiples paquetes coach: consolida totales', () => {
    const r = resumenCoach([
      paquete({ id: 'a', sesiones_compradas: 5, coach_sesiones: sesiones(5) }),
      paquete({ id: 'b', sesiones_compradas: 3, coach_sesiones: sesiones(1) }),
    ])
    expect(r).toEqual({ compradas: 8, realizadas: 6, restantes: 2 })
  })

  it('lista vacia da ceros', () => {
    expect(resumenCoach([])).toEqual({ compradas: 0, realizadas: 0, restantes: 0 })
  })
})

describe('paqueteDestino', () => {
  it('elige el paquete mas antiguo con cupo disponible', () => {
    const p = paqueteDestino([
      paquete({ id: 'nuevo', creado_en: '2026-03-01T00:00:00Z', sesiones_compradas: 5, coach_sesiones: sesiones(1) }),
      paquete({ id: 'viejo', creado_en: '2026-01-01T00:00:00Z', sesiones_compradas: 5, coach_sesiones: sesiones(2) }),
    ])
    expect(p?.id).toBe('viejo')
  })

  it('salta paquetes agotados y usa el siguiente con cupo', () => {
    const p = paqueteDestino([
      paquete({ id: 'agotado', creado_en: '2026-01-01T00:00:00Z', sesiones_compradas: 3, coach_sesiones: sesiones(3) }),
      paquete({ id: 'con-cupo', creado_en: '2026-02-01T00:00:00Z', sesiones_compradas: 3, coach_sesiones: sesiones(1) }),
    ])
    expect(p?.id).toBe('con-cupo')
  })

  it('devuelve null si todos los paquetes estan agotados', () => {
    expect(
      paqueteDestino([
        paquete({ id: 'a', sesiones_compradas: 2, coach_sesiones: sesiones(2) }),
        paquete({ id: 'b', sesiones_compradas: 1, coach_sesiones: sesiones(1) }),
      ])
    ).toBeNull()
  })

  it('sin paquetes devuelve null', () => {
    expect(paqueteDestino([])).toBeNull()
  })
})

describe('estadoCoach', () => {
  it('semaforo segun restantes', () => {
    expect(estadoCoach(6)).toBe('disponible')
    expect(estadoCoach(1)).toBe('ultima')
    expect(estadoCoach(0)).toBe('agotado')
    expect(estadoCoach(-1)).toBe('agotado')
  })
})
