import { describe, expect, it } from 'vitest'

import { isMovimientoBloqueadoEnHistorial } from './MovimientosClient'

describe('MovimientosClient', () => {
  it('bloquea visualmente anticipos y aplicaciones de saldo en historial general', () => {
    expect(isMovimientoBloqueadoEnHistorial('anticipo')).toBe(true)
    expect(isMovimientoBloqueadoEnHistorial('aplicacion_saldo')).toBe(true)
    expect(isMovimientoBloqueadoEnHistorial('abono')).toBe(false)
  })
})
