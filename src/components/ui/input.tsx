import * as React from "react"
import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onWheel, ...props }, ref) => {
    // Un <input type="number"> enfocado cambia de valor cuando la rueda del
    // mouse pasa por encima. Scrolleando la pagina, un monto de 50.000 se
    // volvio 49.999,99 sin que nadie lo tocara (14 de agosto de 2026). Quitarle
    // el foco al rodar corta eso de raiz y no estorba a nadie: para mover el
    // valor a proposito estan las flechas del teclado.
    const alRodar = (e: React.WheelEvent<HTMLInputElement>) => {
      onWheel?.(e)
      if (type === "number" && document.activeElement === e.currentTarget) {
        e.currentTarget.blur()
      }
    }

    return (
      <input
        type={type}
        onWheel={alRodar}
        className={cn(
          "flex h-10 w-full rounded-2xl border border-linea bg-panel px-3 py-2 text-sm text-tinta transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gris hover:border-linea-fuerte focus-visible:border-acento focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-acento/40 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

