"use client"

import { useSyncExternalStore } from "react"

const nadaQueEscuchar = () => () => {}

/**
 * true en el navegador ya hidratado, false en el servidor y durante la
 * hidratacion. Sirve para lo que solo existe en el navegador (portales,
 * localStorage) sin el truco de setMounted(true) en un efecto, que dibujaba
 * el componente dos veces.
 */
export function useEstaMontado(): boolean {
  return useSyncExternalStore(
    nadaQueEscuchar,
    () => true,
    () => false
  )
}
