// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MoneyInput } from '../money-input'
import { Input } from '../input'

// Prueba del campo de plata en un navegador de verdad (simulado), porque el
// error del 14 de agosto de 2026 no se veia en ninguna funcion suelta: 50.000
// se volvio 49.999,99 por la rueda del mouse sobre un <input type="number">.

afterEach(cleanup)

describe('MoneyInput', () => {
  it('muestra los miles con punto mientras se escribe', () => {
    render(<MoneyInput name="monto" aria-label="monto" />)
    const campo = screen.getByLabelText('monto') as HTMLInputElement

    fireEvent.change(campo, { target: { value: '50000' } })

    expect(campo.value).toBe('50.000')
  })

  // El corazon del arreglo: rodar la rueda encima del campo no puede mover la
  // cifra. Como es de texto, el navegador ni siquiera tiene como cambiarla.
  it('la rueda del mouse no cambia el valor', () => {
    render(<MoneyInput name="monto" aria-label="monto" />)
    const campo = screen.getByLabelText('monto') as HTMLInputElement
    fireEvent.change(campo, { target: { value: '50000' } })
    campo.focus()

    fireEvent.wheel(campo, { deltaY: 100 })
    fireEvent.wheel(campo, { deltaY: -100 })

    expect(campo.value).toBe('50.000')
  })

  it('las flechas del teclado tampoco le suman centavos', () => {
    render(<MoneyInput name="monto" aria-label="monto" />)
    const campo = screen.getByLabelText('monto') as HTMLInputElement
    fireEvent.change(campo, { target: { value: '50000' } })

    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    fireEvent.keyDown(campo, { key: 'ArrowUp' })

    expect(campo.value).toBe('50.000')
  })

  it('no es un campo numerico: no trae rueda ni flechitas', () => {
    render(<MoneyInput name="monto" aria-label="monto" />)
    const campo = screen.getByLabelText('monto') as HTMLInputElement

    expect(campo.type).toBe('text')
    expect(campo.getAttribute('inputmode')).toBe('decimal')
  })

  it('viaja al servidor con el nombre del campo y el texto formateado', () => {
    render(
      <form data-testid="formulario">
        <MoneyInput name="monto" aria-label="monto" />
      </form>
    )
    const campo = screen.getByLabelText('monto') as HTMLInputElement
    fireEvent.change(campo, { target: { value: '114000' } })

    const datos = new FormData(screen.getByTestId('formulario') as HTMLFormElement)
    expect(datos.get('monto')).toBe('114.000')
  })

  it('arranca con el valor que ya venia, formateado', () => {
    render(<MoneyInput name="monto" aria-label="monto" defaultValue={20000} />)

    expect((screen.getByLabelText('monto') as HTMLInputElement).value).toBe('20.000')
  })
})

describe('Input numerico', () => {
  // El resto del ERP sigue teniendo campos numericos (cantidades, porcentajes).
  // A esos se les quita el foco al rodar la rueda, que es lo que impide que el
  // navegador les cambie el valor.
  it('pierde el foco cuando la rueda pasa por encima', () => {
    render(<Input type="number" aria-label="cantidad" defaultValue={10} />)
    const campo = screen.getByLabelText('cantidad') as HTMLInputElement
    campo.focus()
    expect(document.activeElement).toBe(campo)

    fireEvent.wheel(campo, { deltaY: 100 })

    expect(document.activeElement).not.toBe(campo)
  })

  it('un campo de texto no se desenfoca por rodar la pagina', () => {
    render(<Input type="text" aria-label="nota" />)
    const campo = screen.getByLabelText('nota') as HTMLInputElement
    campo.focus()

    fireEvent.wheel(campo, { deltaY: 100 })

    expect(document.activeElement).toBe(campo)
  })
})
