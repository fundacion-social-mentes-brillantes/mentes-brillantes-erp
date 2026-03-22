import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const base = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--ring-color),0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface-1))] disabled:pointer-events-none disabled:opacity-50";

    const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
      default: "bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] hover:bg-[rgb(var(--accent-strong))] shadow-soft",
      destructive: "bg-[rgb(var(--danger))] text-white hover:bg-[rgb(var(--danger-strong))]",
      outline: "border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--surface-2))]",
      secondary: "bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))] border border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-3))]",
      ghost: "text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--surface-2))]",
      link: "text-[rgb(var(--accent))] underline-offset-4 hover:underline",
    };

    const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-md px-3",
      lg: "h-11 rounded-md px-8",
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

