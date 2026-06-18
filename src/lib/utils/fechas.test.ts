import { describe, it, expect } from 'vitest'
import { fechaLocalISO, fechaHoyBogota, ZONA_HORARIA } from './fechas'

describe('fechaLocalISO (America/Bogota)', () => {
  it('una hora nocturna en UTC se mantiene en el dia local de Colombia (UTC-5)', () => {
    // 2026-06-18T02:00:00Z = 2026-06-17 21:00 en Bogota
    expect(fechaLocalISO(new Date('2026-06-18T02:00:00Z'))).toBe('2026-06-17')
  })

  it('mediodia UTC corresponde al mismo dia en Colombia', () => {
    expect(fechaLocalISO(new Date('2026-06-18T12:00:00Z'))).toBe('2026-06-18')
  })

  it('el cambio de mes nocturno no se adelanta un dia', () => {
    // 2026-07-01T03:00:00Z = 2026-06-30 22:00 en Bogota
    expect(fechaLocalISO(new Date('2026-07-01T03:00:00Z'))).toBe('2026-06-30')
  })

  it('fechaHoyBogota devuelve formato YYYY-MM-DD', () => {
    expect(fechaHoyBogota()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(ZONA_HORARIA).toBe('America/Bogota')
  })
})
