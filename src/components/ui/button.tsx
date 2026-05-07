import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const base = "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--ring-color),0.62)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface-1))] disabled:pointer-events-none disabled:opacity-50";

    const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
      default: "bg-[linear-gradient(135deg,rgb(var(--accent)),rgb(var(--accent-strong)))] text-[rgb(var(--accent-foreground))] hover:shadow-strong shadow-soft border border-[rgba(var(--accent),0.32)]",
      destructive: "bg-[linear-gradient(135deg,rgb(var(--danger)),rgb(var(--danger-strong)))] text-white hover:shadow-soft",
      outline: "border border-[rgba(var(--border),0.74)] bg-[rgba(var(--surface-1),0.78)] text-[rgb(var(--text-primary))] hover:bg-[rgba(var(--surface-2),0.9)] hover:border-[rgba(var(--gold),0.42)]",
      secondary: "bg-[rgba(var(--surface-2),0.76)] text-[rgb(var(--text-primary))] border border-[rgba(var(--border),0.68)] hover:bg-[rgba(var(--surface-3),0.86)]",
      ghost: "text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--surface-2))]",
      link: "text-[rgb(var(--accent))] underline-offset-4 hover:underline",
    };

    const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-xl px-3",
      lg: "h-11 rounded-xl px-8",
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

