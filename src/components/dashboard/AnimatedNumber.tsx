'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

// Número que "cuenta" hasta su valor al aparecer.
// SEGURO para cifras financieras: el HTML del servidor ya trae el valor final
// (sin JS, con pestaña oculta o con reduced-motion se ve el número correcto);
// el conteo es solo un adorno cuando la pestaña está visible.
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
  const [display, setDisplay] = useState(value)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // Pestaña oculta: el navegador pausa requestAnimationFrame y el conteo se
    // quedaría a medias. En ese caso mostramos el valor final directo.
    if (reduced || document.visibilityState === 'hidden') {
      setDisplay(value)
      return
    }
    setDisplay(0)
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
      {/* en-US fijo para que coincida con el formato del resto del dashboard */}
      {display.toLocaleString('en-US')}
    </span>
  )
}
