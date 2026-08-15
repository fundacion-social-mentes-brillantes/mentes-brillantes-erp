import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

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
          "flex h-10 w-full rounded-xl border border-[rgba(var(--border),0.72)] bg-[rgb(var(--input-bg))] px-3 py-2 text-sm text-[rgb(var(--text-primary))] ring-offset-[rgb(var(--surface-1))] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[rgb(var(--text-muted))] shadow-[inset_0_1px_0_rgba(var(--glass-highlight),0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--ring-color),0.62)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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

