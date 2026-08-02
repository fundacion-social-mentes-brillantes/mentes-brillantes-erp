import { requireRoles } from '@/lib/utils/authz'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CuentasClient } from './CuentasClient'
import { filtrarPagosValidos, sumarMontos } from '@/lib/utils/contable'

// Esta pantalla traia TODAS las cuentas de una sola vez. Con 2.265 en la base y
// el tope de 1.000 filas de Supabase, eso significaba que 1.265 cuentas —las mas
// VIEJAS, porque la lista va de mas nueva a mas antigua— simplemente no salian,
// y sin ningun aviso: la consulta no falla, solo devuelve menos.
//
// Ahora se pide una pagina a la vez y se muestra cuantas hay en total, para que
// nunca vuelva a faltar nada en silencio. Para llegar a una cuenta vieja esta el
// buscador, que filtra en la base (no en pantalla) y por eso alcanza las 2.265.
//
// La hoja de cada asistente (/asistentes/[id]) NO se toca y sigue completa: la
// persona con mas historial tiene 71 cuentas y 91 pagos, muy por debajo del tope.

const POR_PAGINA = 100

type Params = { searchParams: Promise<{ q?: string; pagina?: string }> }

export default async function CuentasPage({ searchParams }: Params) {
  const { supabase, perfil } = await requireRoles(['admin', 'caja'])
  const isAdmin = perfil.rol === 'admin'

  const { q, pagina } = await searchParams
  const busqueda = (q ?? '').trim()
  const paginaActual = Math.max(1, Number(pagina) || 1)
  const desde = (paginaActual - 1) * POR_PAGINA

  // Buscar por nombre de la persona obliga a resolver primero quienes coinciden:
  // el filtro no puede ir sobre la tabla relacionada en la misma consulta.
  let asistentesCoincidentes: string[] | null = null
  if (busqueda) {
    const { data } = await supabase
      .from('asistentes')
      .select('id')
      .ilike('nombre', `%${busqueda}%`)
      .limit(500)
    asistentesCoincidentes = (data ?? []).map((a: any) => a.id)
  }

  let query = supabase
    .from('cuentas_por_cobrar')
    .select(
      `
      id,
      concepto,
      fecha_emision,
      estado,
      valor_total,
      asistente_id,
      asistentes ( nombre ),
      pagos_abonos ( monto, fecha_pago, metodo_pago, estado, notas )
    `,
      { count: 'exact' }
    )

  if (busqueda) {
    // Coincide por concepto o por nombre de la persona.
    const porAsistente = asistentesCoincidentes?.length
      ? `,asistente_id.in.(${asistentesCoincidentes.join(',')})`
      : ''
    query = query.or(`concepto.ilike.%${busqueda}%${porAsistente}`)
  }

  const { data: cuentasData, count } = await query
    .order('fecha_emision', { ascending: false })
    .range(desde, desde + POR_PAGINA - 1)

  const cuentas = (cuentasData ?? []).map((cuenta: any) => {
    const valor_total = Number(cuenta.valor_total)
    const pagosValidos = filtrarPagosValidos(cuenta.pagos_abonos ?? [])
    const total_abonado = sumarMontos(pagosValidos)
    const monto_pendiente = valor_total - total_abonado
    return {
      id: cuenta.id,
      concepto: cuenta.concepto,
      fecha_emision: cuenta.fecha_emision,
      estado: cuenta.estado,
      valor_total,
      asistente_id: cuenta.asistente_id,
      asistente_nombre: cuenta.asistentes?.nombre ?? null,
      abonos: cuenta.pagos_abonos ?? [],
      saldos: { valor_total, total_abonado, monto_pendiente },
    }
  })

  const total = count ?? cuentas.length
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--text-primary))]">Cuentas por Cobrar</h1>
          <p className="text-[rgb(var(--text-muted))] text-sm">Gestiona las deudas de los asistentes y sus pagos.</p>
        </div>
        <Link
          href="/cuentas/nueva"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-[rgb(var(--surface-3))] text-[rgb(var(--text-primary))] border border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))] h-10 px-4 py-2 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva Cuenta
        </Link>
      </div>

      <CuentasClient
        cuentas={cuentas}
        isAdmin={isAdmin}
        busqueda={busqueda}
        total={total}
        paginaActual={paginaActual}
        totalPaginas={totalPaginas}
        porPagina={POR_PAGINA}
      />
    </div>
  )
}
