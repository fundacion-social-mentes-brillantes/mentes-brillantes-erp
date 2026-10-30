import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, Edit2, ExternalLink, MapPin, Ticket, Users } from 'lucide-react'
import { requireRoles } from '@/lib/utils/authz'
import { cargarTaller } from '@/lib/operaciones/talleres'
import { enlaceInvitacion } from '@/lib/integraciones/talleres-publico'
import { fechaHoyBogota, formatearFechaEvento } from '@/lib/utils/fechas'
import { pesos } from '@/lib/utils/pesos'
import { objeto } from '@/lib/utils/lectura'
import { ChipEstadoTaller } from '../piezas'
import { EstadoTallerBotones } from './EstadoTallerBotones'
import { GastosTaller, type GastoFila } from './GastosTaller'
import { InscritosTaller, type FilaInscrito } from './InscritosTaller'
import { PuertaTaller } from './PuertaTaller'

type Pestana = 'inscritos' | 'puerta' | 'gastos'

export default async function TallerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ver?: string; inscribir?: string; escanear?: string }>
}) {
  const [{ id }, { ver, inscribir, escanear }] = await Promise.all([params, searchParams])
  const { supabase, perfil } = await requireRoles(['admin', 'caja'])
  const isAdmin = perfil.rol === 'admin'

  const datos = await cargarTaller(supabase, id)
  if (!datos) notFound()
  const { taller, preguntas, resumen, gastos } = datos
  const pestana: Pestana = ver === 'puerta' ? 'puerta' : ver === 'gastos' && isAdmin ? 'gastos' : 'inscritos'
  const hoy = fechaHoyBogota()
  const precio = Number(taller.precio || 0)

  const filas: FilaInscrito[] = resumen.filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    documento: f.documento,
    telefono: f.telefono,
    correo: f.correo,
    respuestas: Object.fromEntries(Object.entries(objeto(f.respuestas)).map(([k, v]) => [k, String(v ?? '')])),
    valor_acordado: Number(f.valor_acordado || 0),
    estado: f.estado,
    asistio: f.asistio,
    hora_llegada: f.hora_llegada,
    origen: f.origen,
    asistente_id: f.asistente_id,
    comprobante_ruta: f.comprobante_ruta,
    comprobante_en: f.comprobante_en,
    notas: f.notas,
    creado_en: f.creado_en,
    pagado: f.pagado,
    pendiente: f.pendiente,
    estadoPago: f.estadoPago,
    pagos: f.pagos.map((p) => ({ id: p.id, monto: Number(p.monto), metodo_pago: p.metodo_pago, fecha: p.fecha, estado: p.estado ?? null, notas: p.notas ?? null })),
  }))

  const pestanas: Array<{ clave: Pestana; nombre: string }> = [
    { clave: 'inscritos', nombre: `Inscritos (${resumen.inscritos})` },
    { clave: 'puerta', nombre: 'Puerta' },
    ...(isAdmin ? [{ clave: 'gastos' as const, nombre: 'Gastos' }] : []),
  ]

  const cifras = [
    { titulo: 'Recaudado', valor: pesos(resumen.recaudado), color: 'text-verde', nota: resumen.esperado > 0 ? `de ${pesos(resumen.esperado)} esperados` : 'sin costo' },
    {
      titulo: 'Por cobrar',
      valor: pesos(resumen.porCobrar),
      color: resumen.porCobrar > 0 ? 'text-ambar' : 'text-tinta',
      nota: resumen.conDeuda === 1 ? '1 persona debe' : `${resumen.conDeuda} personas deben`,
    },
    ...(isAdmin
      ? [
          { titulo: 'Gastos', valor: pesos(resumen.gastos), color: resumen.gastos > 0 ? 'text-rojo' : 'text-tinta', nota: 'refrigerios, materiales, tallerista…' },
          { titulo: 'Queda', valor: pesos(resumen.resultado), color: resumen.resultado < 0 ? 'text-rojo' : 'text-tinta', nota: 'recaudado menos gastos' },
        ]
      : [
          { titulo: 'Inscritos', valor: String(resumen.inscritos), color: 'text-tinta', nota: taller.cupo ? `de ${taller.cupo} cupos` : 'sin límite de cupo' },
          { titulo: 'Llegaron', valor: String(resumen.asistieron), color: 'text-tinta', nota: `de ${resumen.inscritos} inscritos` },
        ]),
  ]

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/talleres"
            aria-label="Volver a talleres"
            className="mt-0.5 inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gris transition-colors hover:bg-suave hover:text-tinta"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-sm text-gris">{taller.tipo}</p>
            <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">
              {taller.nombre}
              <ChipEstadoTaller estado={taller.estado} />
            </h1>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-gris">
              <li className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden />
                {formatearFechaEvento(taller.fecha_inicio, 'Sin fecha', true)}
              </li>
              {taller.lugar && (
                <li className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" aria-hidden />
                  {taller.lugar}
                </li>
              )}
              <li className="flex items-center gap-1.5">
                <Ticket className="h-4 w-4" aria-hidden />
                {precio > 0 ? `${pesos(precio)} por persona` : 'Gratis'}
              </li>
              <li className="flex items-center gap-1.5">
                <Users className="h-4 w-4" aria-hidden />
                {taller.cupo ? `${resumen.inscritos} de ${taller.cupo} cupos` : `${resumen.inscritos} inscritos`}
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-12 lg:justify-end lg:pl-0">
          <a
            href={enlaceInvitacion(taller.slug, taller.estado)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-linea bg-panel px-3 text-sm font-semibold text-tinta transition-colors hover:bg-suave"
          >
            <ExternalLink className="h-4 w-4" />
            {taller.estado === 'abierto' ? 'Ver invitación' : 'Vista previa de la invitación'}
          </a>
          {isAdmin && (
            <>
            <EstadoTallerBotones tallerId={taller.id} estado={taller.estado} />
            <Link
              href={`/talleres/${taller.id}/editar`}
              prefetch={false}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-linea bg-panel px-3 text-sm font-semibold text-tinta transition-colors hover:bg-suave"
            >
              <Edit2 className="h-4 w-4" />
              Editar
            </Link>
            </>
          )}
        </div>
      </div>

      <section aria-label="Cuentas del taller" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-linea bg-panel lg:grid-cols-4">
        {cifras.map((c, i) => (
          <div
            key={c.titulo}
            className={`p-4 md:p-5 ${i % 2 === 1 ? 'border-l border-linea' : ''} ${i >= 2 ? 'border-t border-linea lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
          >
            <p className="text-sm text-gris">{c.titulo}</p>
            <p className={`cifra mt-1 text-xl font-bold md:text-2xl ${c.color}`}>{c.valor}</p>
            <p className="mt-0.5 text-xs text-gris">{c.nota}</p>
          </div>
        ))}
      </section>

      <nav aria-label="Secciones del taller" className="flex gap-1 overflow-x-auto rounded-xl border border-linea bg-panel p-1">
        {pestanas.map((p) => (
          <Link
            key={p.clave}
            href={p.clave === 'inscritos' ? `/talleres/${taller.id}` : `/talleres/${taller.id}?ver=${p.clave}`}
            prefetch={false}
            scroll={false}
            aria-current={pestana === p.clave ? 'page' : undefined}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-center text-sm font-semibold transition-colors ${
              pestana === p.clave ? 'bg-acento/12 text-acento' : 'text-gris hover:bg-suave hover:text-tinta'
            }`}
          >
            {p.nombre}
          </Link>
        ))}
      </nav>

      {pestana === 'inscritos' && (
        <InscritosTaller
          tallerId={taller.id}
          precio={precio}
          preguntas={preguntas}
          filas={filas}
          hoy={hoy}
          isAdmin={isAdmin}
          inscribirAbierto={inscribir === '1'}
        />
      )}
      {pestana === 'puerta' && (
        <PuertaTaller
          tallerId={taller.id}
          precio={precio}
          preguntas={preguntas}
          filas={filas}
          hoy={hoy}
          isAdmin={isAdmin}
          escanear={escanear === '1'}
        />
      )}
      {pestana === 'gastos' && isAdmin && (
        <GastosTaller
          tallerId={taller.id}
          nombreTaller={taller.nombre}
          gastos={gastos.map(
            (g): GastoFila => ({
              id: g.id,
              concepto: g.concepto,
              monto: Number(g.monto),
              categoria: g.categoria ?? null,
              metodo_pago: g.metodo_pago ?? null,
              fecha: g.fecha,
              estado: g.estado ?? null,
              notas: g.notas ?? null,
            })
          )}
          hoy={hoy}
        />
      )}
    </div>
  )
}
