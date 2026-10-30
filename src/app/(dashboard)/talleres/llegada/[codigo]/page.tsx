import Link from 'next/link'
import { ArrowLeft, CalendarDays, CircleAlert, DoorOpen, ScanLine, Ticket } from 'lucide-react'
import { requireRoles } from '@/lib/utils/authz'
import { codigoDeBoleta, entradaPorCodigo } from '@/lib/operaciones/talleres'
import { formatearFechaEvento } from '@/lib/utils/fechas'
import { pesos } from '@/lib/utils/pesos'
import { RegistrarLlegada } from './RegistrarLlegada'

// Lo que abre la camara normal del celular al leer el QR de una boleta: el QR
// lleva talleres.gimnasioemocionalmb.com/entrada/<codigo>, que manda aqui. Dice
// de quien es la entrada y deja registrar su llegada con un toque (abrir la
// pagina no marca nada). Para recibir a mucha gente seguida, mejor el lector de
// la pestaña Puerta del taller, que lee una boleta tras otra.

export default async function LlegadaPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const { supabase } = await requireRoles(['admin', 'caja'])
  const limpio = codigoDeBoleta(codigo)
  const entrada = limpio ? await entradaPorCodigo(supabase, limpio) : null

  if (!entrada || !limpio) {
    return (
      <div className="mx-auto max-w-md space-y-4 pb-10">
        <div className="rounded-2xl border border-rojo/30 bg-rojo/10 p-5">
          <p className="flex items-start gap-2 font-semibold text-rojo">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            Esa entrada no existe
          </p>
          <p className="mt-2 text-sm text-tinta">
            El QR no es de ninguna inscripción. Revisa que sea la boleta de un taller de la fundación, o busca a la persona por su
            nombre en la puerta del taller.
          </p>
        </div>
        <Link href="/talleres" prefetch={false} className="inline-flex items-center gap-2 text-sm font-semibold text-acento">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Ir a los talleres
        </Link>
      </div>
    )
  }

  const { taller, inscripcion } = entrada
  const puerta = `/talleres/${taller.id}?ver=puerta`

  return (
    <div className="mx-auto max-w-md space-y-4 pb-10">
      <Link href={puerta} prefetch={false} className="inline-flex items-center gap-2 text-sm font-semibold text-gris hover:text-tinta">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {taller.nombre}
      </Link>

      <section aria-labelledby="entrada-nombre" className="rounded-2xl border border-linea bg-panel p-5">
        <p className="text-sm text-gris">{taller.tipo ? `${taller.tipo} · ` : ''}Entrada</p>
        <h1 id="entrada-nombre" className="mt-1 text-2xl font-bold leading-tight text-tinta">
          {inscripcion.nombre}
        </h1>
        <ul className="mt-3 space-y-1.5 text-sm text-gris">
          <li className="flex items-center gap-2">
            <Ticket className="h-4 w-4" aria-hidden />
            {entrada.numero ? `Entrada N.º ${entrada.numero}` : 'Inscripción cancelada'}
            {inscripcion.documento ? ` · CC ${inscripcion.documento}` : ''}
          </li>
          <li className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" aria-hidden />
            {formatearFechaEvento(taller.fecha_inicio, 'Sin fecha')}
          </li>
        </ul>
        <p className="mt-3 text-sm font-semibold">
          {entrada.pendiente > 0 ? (
            <span className="text-ambar">Debe {pesos(entrada.pendiente)}: cóbrale en la puerta del taller</span>
          ) : entrada.valor > 0 ? (
            <span className="text-verde">Pagó todo</span>
          ) : (
            <span className="text-gris">Sin costo</span>
          )}
        </p>

        <div className="mt-5">
          <RegistrarLlegada
            codigo={limpio}
            tallerId={taller.id}
            cancelada={entrada.cancelada}
            yaLlego={inscripcion.asistio}
            horaLlegada={inscripcion.horaLlegada}
          />
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          href={`${puerta}&escanear=1`}
          prefetch={false}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-linea bg-panel px-4 text-sm font-semibold text-tinta transition-colors hover:bg-suave"
        >
          <ScanLine className="h-4 w-4" aria-hidden />
          Escanear más entradas
        </Link>
        <Link
          href={puerta}
          prefetch={false}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-linea bg-panel px-4 text-sm font-semibold text-tinta transition-colors hover:bg-suave"
        >
          <DoorOpen className="h-4 w-4" aria-hidden />
          Ir a la puerta del taller
        </Link>
      </div>
    </div>
  )
}
