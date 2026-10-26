import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    // Botones planos: el principal con el color escogido, sin degradados ni brillos.
    const base = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0";

    const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
      default: "bg-acento text-sobre-acento hover:bg-acento-fuerte",
      destructive: "bg-rojo text-fondo hover:bg-rojo-fuerte",
      outline: "border border-linea bg-panel text-tinta hover:border-linea-fuerte hover:bg-suave",
      secondary: "bg-suave-2 text-tinta hover:bg-linea",
      ghost: "text-tinta hover:bg-suave",
      link: "text-acento underline-offset-4 hover:underline",
    };

    const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
      default: "h-10 px-4",
      sm: "h-9 px-3",
      lg: "h-12 px-6 text-base",
      icon: "h-10 w-10",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }

