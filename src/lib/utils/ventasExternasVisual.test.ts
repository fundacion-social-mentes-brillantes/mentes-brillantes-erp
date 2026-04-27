import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('ventas externas como ingreso normal', () => {
  it('dashboard y liquidaciones no muestran ventas externas como rubro visual separado', () => {
    const dashboard = readFileSync(join(root, 'src/components/dashboard/Dashboard.tsx'), 'utf8')
    const liquidaciones = readFileSync(join(root, 'src/app/(dashboard)/liquidaciones/[id]/page.tsx'), 'utf8')
    const exportacion = readFileSync(join(root, 'src/components/liquidaciones/ExportarLiquidacion.tsx'), 'utf8')

    expect(dashboard).not.toContain('name: "Ventas Externas"')
    expect(dashboard).not.toContain('cartera + donaciones + ventas externas')
    expect(liquidaciones).not.toContain('>Ventas externas<')
    expect(liquidaciones).not.toContain('>Ventas externas</th>')
    expect(exportacion).not.toContain('Ventas externas:')
  })
})
