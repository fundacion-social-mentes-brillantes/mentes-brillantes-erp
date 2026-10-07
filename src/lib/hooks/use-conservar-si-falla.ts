"use client"

import { useEffect, useRef, type FormEvent } from "react"

type ConError = { error?: string | null } | null | undefined
type Campo = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
type Recordado = { form: HTMLFormElement; campos: Array<[string, string, boolean]> }

/**
 * React 19 vacia un <form action={...}> cada vez que la accion termina, aunque
 * el servidor haya respondido con un error ("los socios ya suman 100%", "ya
 * hay un periodo abierto"...). La persona perdia todo lo escrito por un
 * detalle y tenia que empezar de nuevo.
 *
 * Uso: `const recordarFormulario = useConservarSiFalla(state)` y en el
 * formulario `onSubmitCapture={recordarFormulario}`. Al enviar se guarda lo
 * escrito; si la respuesta trae error, se devuelve a los campos. Si salio
 * bien no se toca nada (el formulario se limpia como siempre). Las contrasenas
 * no se guardan nunca.
 */
export function useConservarSiFalla(estado: ConError) {
  const recordado = useRef<Recordado | null>(null)

  useEffect(() => {
    const ultimo = recordado.current
    if (!estado?.error || !ultimo || !ultimo.form.isConnected) return
    for (const [nombre, valor, marcado] of ultimo.campos) restaurar(ultimo.form, nombre, valor, marcado)
  }, [estado])

  return (evento: FormEvent<HTMLFormElement>) => {
    const form = evento.currentTarget
    recordado.current = {
      form,
      campos: camposQueSeRecuerdan(form).map((c) => [c.name, c.value, c instanceof HTMLInputElement ? c.checked : false]),
    }
  }
}

export function camposQueSeRecuerdan(form: HTMLFormElement): Campo[] {
  return Array.from(form.elements).filter((el): el is Campo => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return false
    if (!el.name || el.disabled) return false
    // Los ocultos los maneja el propio componente; contrasenas y archivos no se copian.
    return !(el instanceof HTMLInputElement && ["hidden", "password", "file", "submit", "button"].includes(el.type))
  })
}

function restaurar(form: HTMLFormElement, nombre: string, valor: string, marcado: boolean) {
  for (const campo of camposQueSeRecuerdan(form)) {
    if (campo.name !== nombre) continue
    if (campo instanceof HTMLInputElement && (campo.type === "checkbox" || campo.type === "radio")) {
      if (campo.value === valor) campo.checked = marcado
      continue
    }
    if (campo.value === valor) continue
    // Con el setter nativo React tambien se entera (campos con onChange propio).
    const proto = Object.getPrototypeOf(campo) as object
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(campo, valor)
    campo.dispatchEvent(new Event("input", { bubbles: true }))
    campo.dispatchEvent(new Event("change", { bubbles: true }))
  }
}
