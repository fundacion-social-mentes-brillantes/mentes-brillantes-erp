'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

// Número que "cuenta" hasta su valor al aparecer. Respeta prefers-reduced-motion
// (si el usuario pide menos movimiento, muestra el valor final directo).
export function AnimatedNumber({
  value,
  prefix = '$',
  duration = 950,
  className,
  style,
}: {
  value: number
  prefix?: string
  duration?: number
  className?: string
  style?: CSSProperties
}) {
  const [display, setDisplay] = useState(0)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cúbico
      setDisplay(Math.round(value * eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [value, duration])

  return (
    <span className={className} style={style}>
      {prefix}
      {/* en-US fijo para que coincida con el formato del resto del dashboard
          (el servidor formatea con coma; sin esto el navegador usaría es-CO) */}
      {display.toLocaleString('en-US')}
    </span>
  )
}
