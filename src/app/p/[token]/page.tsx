import type { CSSProperties, ReactNode } from "react"
import type { Metadata } from "next"
import Image from "next/image"
import { headers } from "next/headers"
import { Public_Sans, Young_Serif } from "next/font/google"
import { createAdminClient } from "@/lib/supabase/admin"
import { anotarAcceso, ORIGEN_PUBLICO, validarEnlace } from "@/lib/enlaces-personales/enlaces"
import { esVistaPreviaDeEnlace, secretoEnlaces } from "@/lib/enlaces-personales/token"
import {
  fechaDeSello,
  fechaLarga,
  leerProcesoPersona,
  telefonoWhatsApp,
  type ProcesoPersona,
} from "@/lib/enlaces-personales/proceso"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import { pesos } from "@/lib/utils/pesos"
import estilos from "./mi-proceso.module.css"

// "Mi proceso": lo que cada persona ve con su enlace privado (/p/<token>).
// Publica (sin sesion), solo lectura y solo con lo de esa persona. Nunca se
// guarda en cache ni la indexan los buscadores (ver next.config.mjs).

const titulos = Young_Serif({ weight: "400", subsets: ["latin"], variable: "--letra-titulos", display: "swap" })
const texto = Public_Sans({ weight: ["400", "700"], subsets: ["latin"], variable: "--letra-texto", display: "swap" })

export const dynamic = "force-dynamic"

// Sin el nombre de la persona: esto es lo que muestra WhatsApp en la vista previa.
export const metadata: Metadata = {
  title: "Tu proceso · Gimnasio Emocional Mentes Brillantes",
  description: "Tus sesiones y tus pagos, al día.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
  openGraph: {
    title: "Tu proceso en Gimnasio Emocional Mentes Brillantes",
    description: "Tus sesiones y tus pagos, al día.",
    images: [{ url: `${ORIGEN_PUBLICO}/logo-gemb-simbolo.png`, width: 288, height: 168 }],
  },
}

const MAX_SELLOS = 30
const MAX_POR_TOMAR = 12
const GIROS = [-7, 4, -2, 8, -5, 3, -9, 6, -3, 5, -6, 2, 7, -4]

export default async function MiProcesoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const agente = (await headers()).get("user-agent")

  // WhatsApp y compania abren el enlace para armar la vista previa: a ellos, nada personal.
  if (esVistaPreviaDeEnlace(agente)) {
    return (
      <Marco>
        <Aviso titulo="Tu proceso">Tus sesiones y tus pagos, al día.</Aviso>
      </Marco>
    )
  }

  const secreto = secretoEnlaces()
  const admin = createAdminClient()
  if (!secreto || !admin) return <EnlaceSinServicio />

  const asistenteId = await validarEnlace(admin, token, secreto)
  const telefono = await telefonoFundacion(admin)
  if (!asistenteId) return <EnlaceApagado whatsapp={telefono} />

  const proceso = await leerProcesoPersona(admin, asistenteId)
  if (!proceso) return <EnlaceApagado whatsapp={telefono} />
  await anotarAcceso(admin, asistenteId)

  return (
    <Marco>
      <h1 className={estilos.titulo}>Hola, {proceso.primerNombre}</h1>
      <p className={estilos.hoy}>Así va tu proceso hoy, {fechaLarga(fechaHoyBogota())}.</p>
      <Carne proceso={proceso} />
      <Pagos proceso={proceso} />
      {telefono && (
        <BotonWhatsApp numero={telefono} mensaje={`Hola, soy ${proceso.primerNombre}. Quiero preguntar por mi proceso.`} />
      )}
      <p className={estilos.pie}>Esta página es solo para ti. Si algo no cuadra, escríbenos.</p>
    </Marco>
  )
}

async function telefonoFundacion(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data } = await admin.from("configuracion_empresa").select("telefono").limit(1).maybeSingle()
  return telefonoWhatsApp(data?.telefono)
}

function Marco({ children }: { children: ReactNode }) {
  return (
    <div className={`${estilos.fondo} ${titulos.variable} ${texto.variable}`}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        {/* Tinta de sello: la carga de tinta no es pareja. */}
        <filter id="tinta-sello" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={7} result="ruido" />
          <feColorMatrix in="ruido" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.25 1.5" result="huecos" />
          <feComposite in="SourceGraphic" in2="huecos" operator="in" />
        </filter>
      </svg>
      <main className={estilos.pagina}>
        <header className={estilos.marca}>
          <Image src="/logo-gemb-simbolo.png" alt="Gimnasio Emocional Mentes Brillantes" width={72} height={42} priority />
          <span>
            Gimnasio Emocional
            <br />
            Mentes Brillantes
          </span>
        </header>
        {children}
      </main>
    </div>
  )
}

function Carne({ proceso }: { proceso: ProcesoPersona }) {
  const sellos = proceso.sesiones.slice(-MAX_SELLOS)
  const anteriores = proceso.sesiones.length - sellos.length
  const vacios = Math.min(proceso.porTomar, MAX_POR_TOMAR)
  const sinSesiones = proceso.tomadas === 0 && proceso.porTomar === 0

  return (
    <section className={estilos.carne} aria-labelledby="t-carne">
      <h2 id="t-carne">Tu carné de sesiones</h2>
      <p className={estilos.dueno}>
        {proceso.nombre}
        {proceso.desde ? ` · desde el ${fechaLarga(proceso.desde, true)}` : ""}
      </p>

      {sinSesiones ? (
        <p className={estilos.vacio}>Todavía no tienes sesiones de coach. Cuando tomes la primera, aquí aparecerá su sello.</p>
      ) : (
        <>
          <ol
            className={estilos.sellos}
            aria-label={`${proceso.tomadas} ${proceso.tomadas === 1 ? "sesión tomada" : "sesiones tomadas"} y ${proceso.porTomar} por tomar`}
          >
            {sellos.map((fecha, i) => {
              const { dia, mes } = fechaDeSello(fecha)
              const estilo = { "--giro": `${GIROS[i % GIROS.length]}deg`, "--n": i } as CSSProperties
              return (
                <li key={`${fecha}-${i}`} className={`${estilos.sello} ${estilos.tomada}`} style={estilo}>
                  <svg viewBox="0 0 48 48" aria-hidden="true">
                    <g className={estilos.tinta}>
                      <circle cx="24" cy="24" r="21.5" fill="none" stroke="#BF953F" strokeWidth="2.6" />
                      <circle cx="24" cy="24" r="17" fill="none" stroke="#BF953F" strokeWidth="1" />
                      <circle cx="24" cy="24" r="16.5" fill="rgba(191,149,63,.07)" />
                      <text className={estilos.dia} x="24" y="25" textAnchor="middle">{dia}</text>
                      <text className={estilos.mes} x="24" y="34.5" textAnchor="middle">{mes}</text>
                    </g>
                  </svg>
                </li>
              )
            })}
            {Array.from({ length: vacios }, (_, i) => (
              <li key={`vacio-${i}`} className={estilos.sello}>
                <svg viewBox="0 0 48 48" aria-hidden="true">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(60,26,44,.28)" strokeWidth="1.5" strokeDasharray="3 4" />
                </svg>
              </li>
            ))}
          </ol>
          {(anteriores > 0 || proceso.porTomar > vacios) && (
            <p className={estilos.mas}>
              {anteriores > 0 && `Y ${anteriores} ${anteriores === 1 ? "sesión anterior" : "sesiones anteriores"}. `}
              {proceso.porTomar > vacios && `Aquí se ven ${vacios} de las ${proceso.porTomar} que tienes por tomar.`}
            </p>
          )}
        </>
      )}

      <div className={estilos["cuenta-sesiones"]}>
        <div>
          <b>{proceso.tomadas}</b>
          <span>{proceso.tomadas === 1 ? "sesión tomada" : "sesiones tomadas"}</span>
        </div>
        <div>
          <b>{proceso.porTomar}</b>
          <span>por tomar</span>
        </div>
      </div>
    </section>
  )
}

function Pagos({ proceso }: { proceso: ProcesoPersona }) {
  const sinCuentas = proceso.pendientes.length === 0 && proceso.pagadas.length === 0

  return (
    <section className={estilos.pagos} aria-labelledby="t-pagos">
      <h2 id="t-pagos" className={estilos.subtitulo}>Tus pagos</h2>

      {sinCuentas ? (
        <p className={estilos.vacio}>Todavía no hay pagos ni cuentas a tu nombre.</p>
      ) : (
        <>
          <div className={estilos.resumen}>
            {proceso.totalFalta > 0 ? (
              <>
                <p className={estilos.rotulo}>Te falta pagar</p>
                <p className={estilos.cifra}>{pesos(proceso.totalFalta)}</p>
              </>
            ) : (
              <p className={`${estilos.cifra} ${estilos["cifra-al-dia"]}`}>Estás al día</p>
            )}
            <p className={estilos.pagado}>Has pagado {pesos(proceso.totalPagado)} en total.</p>
          </div>

          {proceso.pendientes.length > 0 && (
            <ul className={estilos.deudas}>
              {proceso.pendientes.map((g) => {
                const avance = g.total > 0 ? Math.round((g.pagado / g.total) * 100) : 0
                return (
                  <li key={g.concepto} className={estilos.deuda}>
                    <div className={estilos.fila}>
                      <h3>
                        {g.concepto}
                        {g.cantidad > 1 ? ` × ${g.cantidad}` : ""}
                      </h3>
                      <span className={estilos.monto}>Falta {pesos(g.falta)}</span>
                    </div>
                    <div className={estilos.barra} aria-hidden="true">
                      <i style={{ width: `${avance}%` }} />
                    </div>
                    <p className={estilos.detalle}>
                      {g.pagado > 0 ? `Pagaste ${pesos(g.pagado)} de ${pesos(g.total)}` : "Todavía no hay pagos"}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}

          {proceso.cuentasPagadas > 0 && (
            <details className={estilos.pagadas}>
              <summary>
                {proceso.cuentasPagadas} {proceso.cuentasPagadas === 1 ? "cuenta ya pagada" : "cuentas ya pagadas"}
                <span>
                  <span className={estilos.ver}>Ver</span>
                </span>
              </summary>
              <ul>
                {proceso.pagadas.map((g) => (
                  <li key={g.concepto}>
                    {g.concepto}
                    <em>{g.cantidad > 1 ? `× ${g.cantidad}` : pesos(g.total)}</em>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function BotonWhatsApp({ numero, mensaje }: { numero: string; mensaje: string }) {
  return (
    <a
      className={estilos.whatsapp}
      href={`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3Z" />
      </svg>
      Escribir por WhatsApp
    </a>
  )
}

function Aviso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className={estilos.aviso}>
      <h1 className={estilos.titulo}>{titulo}</h1>
      <p>{children}</p>
    </section>
  )
}

function EnlaceApagado({ whatsapp }: { whatsapp: string | null }) {
  return (
    <Marco>
      <Aviso titulo="Este enlace ya no funciona">
        Puede que lo hayan cambiado por uno nuevo. Pídele tu enlace a Gimnasio Emocional Mentes Brillantes.
      </Aviso>
      {whatsapp && <BotonWhatsApp numero={whatsapp} mensaje="Hola, mi enlace para ver mi proceso ya no funciona. ¿Me envían uno nuevo?" />}
    </Marco>
  )
}

function EnlaceSinServicio() {
  return (
    <Marco>
      <Aviso titulo="Vuelve en un rato">Esta página no está disponible en este momento.</Aviso>
    </Marco>
  )
}
