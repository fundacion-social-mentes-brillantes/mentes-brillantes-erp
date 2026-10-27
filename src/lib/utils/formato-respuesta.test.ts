import { describe, expect, it } from 'vitest'
import { partirNegrita } from './formato-respuesta'

const comoTexto = (texto: string) =>
  partirNegrita(texto)
    .map((p) => (p.negrita ? `[${p.texto}]` : p.texto))
    .join('')

describe('respuestas del Asistente IA: negrita sin asteriscos', () => {
  it('convierte **texto** en negrita y quita los asteriscos', () => {
    expect(comoTexto('Tiene un **total pendiente de $150,000 COP**.')).toBe('Tiene un [total pendiente de $150,000 COP].')
  })

  it('funciona en listas y con varias negritas en un renglón', () => {
    expect(comoTexto('- **Concepto:** Sesión guía coach\n- **Estado:** Pendiente')).toBe(
      '- [Concepto:] Sesión guía coach\n- [Estado:] Pendiente'
    )
  })

  it('los títulos con # salen en negrita y sin los numerales', () => {
    expect(comoTexto('### Resumen\nTodo al día')).toBe('[Resumen]\nTodo al día')
  })

  it('deja quietos los asteriscos sueltos o sin cerrar', () => {
    expect(comoTexto('5 * 3 = 15')).toBe('5 * 3 = 15')
    expect(comoTexto('**sin cerrar')).toBe('**sin cerrar')
    expect(comoTexto('****')).toBe('****')
  })

  it('no une negritas de renglones distintos', () => {
    expect(comoTexto('**uno\ndos**')).toBe('**uno\ndos**')
  })

  it('un texto sin marcas queda igual', () => {
    const texto = 'Daniel ha tomado 8 sesiones.\n1. 2022-07-06\n2. 2023-02-17'
    expect(comoTexto(texto)).toBe(texto)
  })
})
