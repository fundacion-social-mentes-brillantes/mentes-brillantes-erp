// @vitest-environment happy-dom
import { act, render } from "@testing-library/react"
import { useActionState } from "react"
import { describe, expect, it } from "vitest"
import { useConservarSiFalla } from "./use-conservar-si-falla"

type Estado = { error?: string; success?: boolean } | null

function Formulario({ responder }: { responder: (fd: FormData) => Estado }) {
  const [state, action] = useActionState(async (_prev: Estado, fd: FormData) => responder(fd), null)
  const recordarFormulario = useConservarSiFalla(state)
  return (
    <form onSubmitCapture={recordarFormulario} action={action}>
      <input name="nombre" defaultValue="" aria-label="nombre" />
      <input name="clave" type="password" defaultValue="" aria-label="clave" />
      <select name="metodo" defaultValue="efectivo" aria-label="metodo">
        <option value="efectivo">Efectivo</option>
        <option value="nequi">Nequi</option>
      </select>
      <button type="submit">Guardar</button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  )
}

async function enviar(form: HTMLFormElement) {
  await act(async () => {
    form.requestSubmit()
  })
  // deja correr la accion, el reinicio del formulario y el efecto
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

describe("useConservarSiFalla", () => {
  it("si el servidor responde con error, lo escrito vuelve a los campos (menos la contrasena)", async () => {
    const { container, findByRole } = render(<Formulario responder={() => ({ error: "Los socios ya suman 100%" })} />)
    const form = container.querySelector("form")!
    const nombre = form.querySelector<HTMLInputElement>("[name=nombre]")!
    const clave = form.querySelector<HTMLInputElement>("[name=clave]")!
    const metodo = form.querySelector<HTMLSelectElement>("[name=metodo]")!
    nombre.value = "Socio nuevo"
    clave.value = "secreta"
    metodo.value = "nequi"

    await enviar(form)

    expect((await findByRole("alert")).textContent).toContain("100%")
    expect(nombre.value).toBe("Socio nuevo")
    expect(metodo.value).toBe("nequi")
    expect(clave.value).toBe("")
  })

  it("si salio bien, el formulario se limpia como siempre", async () => {
    const { container } = render(<Formulario responder={() => ({ success: true })} />)
    const form = container.querySelector("form")!
    const nombre = form.querySelector<HTMLInputElement>("[name=nombre]")!
    nombre.value = "Algo"

    await enviar(form)

    expect(nombre.value).toBe("")
  })
})
