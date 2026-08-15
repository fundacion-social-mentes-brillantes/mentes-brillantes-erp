'use client'

import * as React from 'react'
import { Input } from './input'
import { formatearMontoInicial, formatearMontoMientrasEscribe } from '@/lib/utils/money-format'

/**
 * Campo de plata. Es de texto a proposito, no `type="number"`:
 *
 *  - un campo numerico cambia de valor con la rueda del mouse o las flechas
 *    cuando el cursor esta encima, y con paso de centavos eso convirtio un
 *    50.000 en 49.999,99 sin que nadie lo notara;
 *  - y ademas no deja escribir "50.000", que es como uno escribe la plata.
 *
 * Lo que se envia es el texto formateado ("50.000"); en el servidor lo
 * convierte `parseMoneyInput`, que entiende puntos de miles y coma decimal.
 */
export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange'> {
  defaultValue?: number | string | null
  onValorChange?: (texto: string) => void
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ defaultValue, onValorChange, placeholder = '0', ...props }, ref) => {
    const [texto, setTexto] = React.useState(() => formatearMontoInicial(defaultValue))

    const alEscribir = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formateado = formatearMontoMientrasEscribe(e.target.value)
      setTexto(formateado)
      onValorChange?.(formateado)
    }

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={texto}
        onChange={alEscribir}
        placeholder={placeholder}
      />
    )
  }
)
MoneyInput.displayName = 'MoneyInput'
