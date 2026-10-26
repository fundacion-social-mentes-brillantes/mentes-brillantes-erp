"use client"

import { useState, useTransition } from "react"
import { Check, Copy, ExternalLink, Link2, RefreshCw, Send, Unlink } from "lucide-react"
import { apagarEnlacePersonal, cambiarEnlacePersonal, encenderEnlacePersonal } from "./enlaceActions"

// Tarjeta "Enlace personal" de la ficha: el enlace privado con el que la persona
// ve su pagina "Mi proceso" (sesiones y pagos) desde el celular, sin contraseña.

type Props = {
  asistenteId: string
  primerNombre: string
  /** Celular de la persona listo para wa.me, o null si no tiene. */
  whatsappPersona: string | null
  url: string | null
  ultimoAcceso: string | null
  configurado: boolean
}

const boton =
  "inline-flex items-center justify-center gap-2 rounded-md border border-linea px-3 py-2 text-sm font-medium text-tinta hover:bg-suave transition-colors disabled:opacity-50"
const botonPrincipal =
  "inline-flex items-center justify-center gap-2 rounded-md bg-acento px-3 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"

export function EnlacePersonalCard({ asistenteId, primerNombre, whatsappPersona, url: urlInicial, ultimoAcceso, configurado }: Props) {
  const [url, setUrl] = useState(urlInicial)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [ocupado, empezar] = useTransition()

  const ejecutar = (accion: () => Promise<{ url?: string; error?: string; apagado?: boolean }>) => {
    setError(null)
    empezar(async () => {
      const r = await accion()
      if (r.error) setError(r.error)
      else if (r.apagado) setUrl(null)
      else if (r.url) setUrl(r.url)
    })
  }

  const copiar = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      setError("No se pudo copiar. Mantén presionado el enlace para copiarlo.")
    }
  }

  if (!configurado) {
    return (
      <p className="text-sm text-ambar">
        Los enlaces personales todavía no están listos en el servidor. Avísale al administrador.
      </p>
    )
  }

  const mensaje = url
    ? `Hola ${primerNombre}, aquí puedes ver cómo va tu proceso en Gimnasio Emocional Mentes Brillantes: ${url}`
    : ""
  const hrefWhatsapp = url
    ? `https://wa.me/${whatsappPersona ?? ""}?text=${encodeURIComponent(mensaje)}`
    : ""

  return (
    <div className="space-y-4">
      <p className="text-sm text-gris">
        Un enlace privado para que {primerNombre} vea sus sesiones y sus pagos desde el celular, sin contraseña. Solo
        sirve para mirar.
      </p>

      {!url ? (
        <button type="button" className={botonPrincipal} disabled={ocupado} onClick={() => ejecutar(() => encenderEnlacePersonal(asistenteId))}>
          <Link2 className="h-4 w-4" />
          {ocupado ? "Creando…" : "Crear enlace"}
        </button>
      ) : (
        <>
          <input
            readOnly
            value={url}
            aria-label="Enlace personal"
            onFocus={(e) => e.currentTarget.select()}
            className="w-full truncate rounded-md border border-linea bg-suave px-3 py-2 text-xs text-tinta"
          />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={boton} onClick={copiar}>
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado ? "Copiado" : "Copiar"}
            </button>
            <a className={botonPrincipal} href={hrefWhatsapp} target="_blank" rel="noopener noreferrer">
              <Send className="h-4 w-4" />
              {whatsappPersona ? "Enviar por WhatsApp" : "Compartir por WhatsApp"}
            </a>
            <a className={`${boton} col-span-2`} href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Ver su página
            </a>
          </div>
          <p className="text-xs text-gris">
            {ultimoAcceso ? `La abrió por última vez el ${ultimoAcceso}.` : "Todavía no la ha abierto."}
            {!whatsappPersona && " No tiene celular en su ficha: al compartir, eliges a quién enviarlo."}
          </p>
          <div className="flex flex-wrap gap-2 border-t border-linea pt-3">
            <button
              type="button"
              className={boton}
              disabled={ocupado}
              onClick={() => {
                if (window.confirm(`¿Cambiar el enlace de ${primerNombre}? El que ya se envió dejará de funcionar.`)) {
                  ejecutar(() => cambiarEnlacePersonal(asistenteId))
                }
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Cambiar enlace
            </button>
            <button
              type="button"
              className={boton}
              disabled={ocupado}
              onClick={() => {
                if (window.confirm(`¿Apagar el enlace de ${primerNombre}? Ya no podrá ver su página hasta que crees uno nuevo.`)) {
                  ejecutar(() => apagarEnlacePersonal(asistenteId))
                }
              }}
            >
              <Unlink className="h-4 w-4" />
              Apagar
            </button>
          </div>
        </>
      )}

      {error && <p className="text-sm text-rojo">{error}</p>}
    </div>
  )
}
