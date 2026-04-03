import { requireRoles } from '@/lib/utils/authz'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Wallet, Lock, Calculator } from 'lucide-react'
import { AdelantoForm } from './AdelantoForm'
import { GenerarLiquidacionBtn } from './GenerarLiquidacionBtn'
import { ExportarLiquidacion } from '@/components/liquidaciones/ExportarLiquidacion'
import { agruparPorMetodo, MetodoPago, METODOS_PAGO_RESUMEN } from '@/lib/utils/liquidaciones'
import { esAnuladoCompleto, filtrarIngresosOperativos, sumarMontos } from '@/lib/utils/contable'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DetallePeriodoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireRoles(['admin'])

  const { data: periodo } = await supabase?.from('periodos').select('*').eq('id', id).single() || { data: null }
  if (!periodo) notFound()

  // Socios activos
  const { data: socios } = await supabase?.from('socios').select('id, nombre, porcentaje_participacion').eq('activo', true) || { data: [] }

  // Adelantos
  const { data: adelantosData } = await supabase
    ?.from('adelantos_socios')
    .select('*, socios(nombre)')
    .eq('periodo_id', id)
    .order('fecha', { ascending: false }) || { data: [] }
  const adelantos = adelantosData || []

  // Liquidaciones (si está cerrado)
  const { data: liquidacionesData } = await supabase
    ?.from('liquidaciones_socios')
    .select('*, socios(nombre)')
    .eq('periodo_id', id) || { data: [] }
  const liquidaciones = liquidacionesData || []

  // Cálculos en vivo si está abierto
  let ingresos_cobrados = 0
  let donaciones_periodo = 0
  let ingresos_operativos = 0
  let egresos_periodo = 0
  let adelantos_periodo = 0
  let ingresosData: any[] = []
  let donacionesValidas: any[] = []
  let egresosData: any[] = []
  let resumenPorCuenta: {
    metodo_pago: MetodoPago
    total_ingresos: number
    total_salidas: number
    saldo_neto_periodo: number
    ingresos_abonos?: number
    ingresos_donaciones?: number
    salidas_egresos?: number
    salidas_adelantos?: number
  }[] = []
  let resumenTotales = { total_ingresos: 0, total_salidas: 0, saldo_neto_periodo: 0 }

  if (periodo.estado === 'abierto') {
    const { data: rawAbonos, error: abonosError } = await supabase
      .from('pagos_abonos')
      .select('monto, metodo_pago, origen_fondos, estado, notas, fecha_pago')
      .gte('fecha_pago', periodo.fecha_inicio)
      .lte('fecha_pago', periodo.fecha_fin)
    if (abonosError) console.error('Error al consultar abonos:', abonosError)

    ingresosData =
      filtrarIngresosOperativos(rawAbonos || []).map((a: any) => ({
        monto: a.monto,
        metodo_pago: a.metodo_pago,
        origen_fondos: a.origen_fondos,
        estado: a.estado,
        notas: a.notas,
      })) || []
    ingresos_cobrados = Math.round(sumarMontos(ingresosData))

    const { data: rawDonaciones, error: donacionesError } = await supabase
      .from('donaciones_asistentes')
      .select('monto, estado, notas, metodo_pago, fecha')
      .gte('fecha', periodo.fecha_inicio)
      .lte('fecha', periodo.fecha_fin)
    if (donacionesError) console.error('Error al consultar donaciones:', donacionesError)

    donacionesValidas = (rawDonaciones || []).filter((d) => !esAnuladoCompleto(d))
    donaciones_periodo = Math.round(donacionesValidas.reduce((acc: number, curr: any) => acc + Number(curr.monto), 0))

    const { data: rawEgresosData, error: egresosError } = await supabase
      .from('egresos')
      .select('monto, estado, notas, metodo_pago, fecha')
      .gte('fecha', periodo.fecha_inicio)
      .lte('fecha', periodo.fecha_fin)
    if (egresosError) console.error('Error al consultar egresos:', egresosError)

    egresosData = rawEgresosData?.filter((item) => !esAnuladoCompleto(item)) || []
    const egresosValidos = Math.round(egresosData.reduce((acc, curr) => acc + Number(curr.monto), 0))
    adelantos_periodo = Math.round(adelantos.reduce((acc: number, curr: any) => acc + Number(curr.monto), 0))
    egresos_periodo = egresosValidos

    ingresos_operativos = ingresos_cobrados + donaciones_periodo

    const { resumen, totales } = agruparPorMetodo({
      abonos: ingresosData,
      donaciones: donacionesValidas,
      egresos: egresosData,
      adelantos,
    })
    resumenPorCuenta = resumen
    resumenTotales = {
      total_ingresos: totales.total_ingresos,
      total_salidas: totales.total_salidas,
      saldo_neto_periodo: totales.saldo_neto_periodo,
    }
  } else if (liquidaciones && liquidaciones.length > 0) {
    ingresos_cobrados = Math.round(Number(liquidaciones[0].ingresos_cobrados))
    donaciones_periodo = Math.round(Number(liquidaciones[0].donaciones_periodo ?? 0))
    ingresos_operativos = Math.round(Number(liquidaciones[0].ingresos_operativos ?? ingresos_cobrados + donaciones_periodo))

    const { data: resumenDb, error: resumenError } = await supabase
      .from('liquidaciones_resumen_cuentas')
      .select('*')
      .eq('periodo_id', id)
      .order('metodo_pago')
    if (resumenError) console.error('Error al consultar resumen congelado:', resumenError)

    const base = METODOS_PAGO_RESUMEN.map((m) => ({
      metodo_pago: m,
      total_ingresos: 0,
      total_salidas: 0,
      saldo_neto_periodo: 0,
    }))
    resumenPorCuenta = base.map((item) => {
      const row = (resumenDb || []).find((r: any) => r.metodo_pago === item.metodo_pago)
      return row
        ? {
            metodo_pago: item.metodo_pago,
            total_ingresos: Number(row.total_ingresos),
            total_salidas: Number(row.total_salidas),
            saldo_neto_periodo: Number(row.saldo_neto_periodo),
            ingresos_abonos: Number(row.ingresos_abonos ?? 0),
            ingresos_donaciones: Number(row.ingresos_donaciones ?? 0),
            salidas_egresos: Number(row.salidas_egresos ?? 0),
            salidas_adelantos: Number(row.salidas_adelantos ?? 0),
          }
        : item
    })
    adelantos_periodo = Math.round(
      resumenPorCuenta.reduce((acc: number, row: any) => acc + Number(row.salidas_adelantos ?? 0), 0)
    )
    egresos_periodo = Math.round(
      resumenPorCuenta.reduce((acc: number, row: any) => acc + Number(row.salidas_egresos ?? 0), 0)
    )
    resumenTotales = resumenPorCuenta.reduce(
      (acc, r) => ({
        total_ingresos: acc.total_ingresos + r.total_ingresos,
        total_salidas: acc.total_salidas + r.total_salidas,
        saldo_neto_periodo: acc.saldo_neto_periodo + r.saldo_neto_periodo,
      }),
      { total_ingresos: 0, total_salidas: 0, saldo_neto_periodo: 0 }
    )
  }

  const utilidad_neta = Math.round(ingresos_operativos - egresos_periodo)

  // Get company config
  const { data: empresaData, error: empresaError } = await supabase.from('configuracion_empresa').select('*').eq('id', 1).single()
  
  if (empresaError) {
    console.error('Error al consultar configuracion_empresa en Liquidaciones:', empresaError)
  }
  console.log('Datos de empresa obtenidos de BD en Liquidaciones:', empresaData)

  const empresa = empresaData || {
    nombre: 'FALLBACK - REVISAR BD O CACHÉ',
    nit: '000000000-0',
    correo: null,
    telefono: null,
    ciudad: null
  }

  // Preparar datos para exportación
  const sociosExportData = periodo.estado === 'abierto' 
    ? socios?.map(socio => {
        const porcentaje = Number(socio.porcentaje_participacion)
        const corresponde = (utilidad_neta * porcentaje) / 100
        const adelantosSocio = adelantos.filter((a: any) => a.socio_id === socio.id)
        const totalAdelantos = adelantosSocio.reduce((acc: number, curr: any) => acc + Number(curr.monto), 0)
        return {
          id: socio.id,
          nombre: socio.nombre,
          porcentaje,
          corresponde,
          adelantos: totalAdelantos,
          neto: corresponde - totalAdelantos
        }
      }) || []
    : liquidaciones?.map((liq: any) => ({
        id: liq.id,
        nombre: liq.socios?.nombre,
        porcentaje: Number(liq.porcentaje_aplicado),
        corresponde: Number(liq.valor_correspondiente),
        adelantos: Number(liq.adelantos_descontados),
        neto: Number(liq.valor_neto_pagar)
      })) || []

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/liquidaciones" className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{periodo.nombre}</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium 
                ${periodo.estado === 'abierto' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'}`}>
                {periodo.estado === 'cerrado' && <Lock className="w-3 h-3" />}
                {periodo.estado.toUpperCase()}
              </span>
            </div>
            <p className="text-zinc-500 text-sm mt-1">
              {new Date(periodo.fecha_inicio).toLocaleDateString()} - {new Date(periodo.fecha_fin).toLocaleDateString()}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <ExportarLiquidacion 
            empresa={empresa}
            periodo={{
              nombre: periodo.nombre,
              estado: periodo.estado,
              fecha_inicio: periodo.fecha_inicio,
              fecha_fin: periodo.fecha_fin
            }}
            financiero={{
              ingresos_cartera: ingresos_cobrados,
              donaciones: donaciones_periodo,
              ingresos_totales: ingresos_operativos,
              egresos: egresos_periodo,
              utilidad: utilidad_neta
            }}
            sociosData={sociosExportData}
          />
          {periodo.estado === 'abierto' && (
            <GenerarLiquidacionBtn periodoId={periodo.id} />
          )}
        </div>
      </div>

      {/* Resumen Financiero */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
          <p className="text-sm text-zinc-500">Ingresos cobrados (cartera)</p>
          <p className="text-2xl font-semibold text-emerald-600 mt-2">${ingresos_cobrados.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
          <p className="text-sm text-zinc-500">Donaciones</p>
          <p className="text-2xl font-semibold text-teal-600 mt-2">${donaciones_periodo.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
          <p className="text-sm text-zinc-500">Ingresos totales</p>
          <p className="text-2xl font-semibold text-emerald-700 mt-2">${ingresos_operativos.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
          <p className="text-sm text-zinc-500">Egresos del Período</p>
          <p className="text-2xl font-semibold text-red-600 mt-2">${egresos_periodo.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
          <p className="text-sm text-zinc-500">Utilidad Neta a Repartir</p>
          <p className="text-2xl font-bold text-zinc-900 mt-2">${utilidad_neta.toLocaleString()}</p>
        </div>
      </div>

      {/* Resumen por cuenta */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-zinc-400" />
            <h3 className="font-semibold text-zinc-900">Resumen por cuenta</h3>
          </div>
          <span className="text-xs text-zinc-500">
            {periodo.estado === 'abierto' ? 'Proyección en vivo' : 'Datos congelados'}
          </span>
        </div>
        <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50/60 text-xs text-zinc-500">
          Total salidas y saldo neto del período usan solo egresos operativos. Los adelantos se muestran aparte y no reducen la utilidad.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-zinc-500 font-medium border-b border-zinc-200 bg-zinc-50">
              <tr>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3 text-right">Ingresos</th>
                <th className="px-4 py-3 text-right">Egresos operativos</th>
                <th className="px-4 py-3 text-right">Adelantos no operativos</th>
                <th className="px-4 py-3 text-right">Saldo neto operativo</th>
                <th className="px-4 py-3 text-right">Valor esperado en cuenta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {resumenPorCuenta.map((row) => (
                <tr key={row.metodo_pago}>
                  <td className="px-4 py-3 font-medium text-zinc-900 capitalize">{row.metodo_pago}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">${row.total_ingresos.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-red-600">-${row.total_salidas.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-amber-600">-${Number(row.salidas_adelantos ?? 0).toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${row.saldo_neto_periodo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    ${row.saldo_neto_periodo.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">${row.saldo_neto_periodo.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="bg-zinc-50 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right text-emerald-700">${resumenTotales.total_ingresos.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-red-600">-${resumenTotales.total_salidas.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-amber-600">-${adelantos_periodo.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">${resumenTotales.saldo_neto_periodo.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">${resumenTotales.saldo_neto_periodo.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda: Adelantos y Formulario */}
        <div className="lg:col-span-1 space-y-6">
          {periodo.estado === 'abierto' ? (
            <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-5 h-5 text-zinc-400" />
                <h3 className="font-semibold text-zinc-900">Registrar Adelanto</h3>
              </div>
              <AdelantoForm periodoId={periodo.id} socios={socios || []} />
            </div>
          ) : (
            <div className="bg-zinc-50 p-6 rounded-xl border border-zinc-200 text-center">
              <Lock className="w-8 h-8 text-zinc-400 mx-auto mb-3" />
              <h3 className="font-semibold text-zinc-900 mb-1">Período Cerrado</h3>
              <p className="text-sm text-zinc-500">No se pueden registrar más adelantos en este Período.</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-zinc-200 bg-zinc-50">
              <h3 className="font-semibold text-zinc-900">Adelantos Registrados</h3>
            </div>
            <div className="divide-y divide-zinc-100 max-h-[400px] overflow-y-auto">
              {adelantos.map((adelanto: any) => (
                <div key={adelanto.id} className="p-4 hover:bg-zinc-50/50">
                  <div className="flex justify-between items-start mb-1">
                    <p className="font-medium text-zinc-900 text-sm">{adelanto.socios?.nombre}</p>
                    <p className="font-semibold text-amber-600 text-sm">${Number(adelanto.monto).toLocaleString()}</p>
                  </div>
                  <div className="flex justify-between items-center text-xs text-zinc-500">
                    <p>{new Date(adelanto.fecha).toLocaleDateString()}</p>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">
                        {adelanto.metodo_pago || 'otro'}
                      </span>
                      <p className="truncate max-w-[120px]">{adelanto.notas}</p>
                    </div>
                  </div>
                </div>
              ))}
              {!adelantos.length && (
                <div className="p-8 text-center text-sm text-zinc-500">
                  No hay adelantos en este Período.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Columna Derecha: Proyección / Liquidación Final */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden h-full flex flex-col">
            <div className="p-6 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-zinc-400" />
              <h3 className="font-semibold text-zinc-900">
                {periodo.estado === 'abierto' ? 'Proyección de Liquidación' : 'Liquidación Final'}
              </h3>
            </div>
            <div className="p-6 flex-1 overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-zinc-500 font-medium border-b border-zinc-200">
                  <tr>
                    <th className="pb-3">Socio</th>
                    <th className="pb-3 text-right">%</th>
                    <th className="pb-3 text-right">Corresponde</th>
                    <th className="pb-3 text-right text-amber-600">Adelantos</th>
                    <th className="pb-3 text-right font-bold text-zinc-900">Neto a Pagar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {periodo.estado === 'abierto' ? (
                    // Proyección en vivo
                    socios?.map(socio => {
                      const porcentaje = Number(socio.porcentaje_participacion)
                      const corresponde = (utilidad_neta * porcentaje) / 100
                      const adelantosSocio = adelantos.filter((a: any) => a.socio_id === socio.id)
                      const totalAdelantos = adelantosSocio.reduce((acc: number, curr: any) => acc + Number(curr.monto), 0)
                      const neto = corresponde - totalAdelantos

                      return (
                        <tr key={socio.id}>
                          <td className="py-4 font-medium text-zinc-900">{socio.nombre}</td>
                          <td className="py-4 text-right text-zinc-500">{porcentaje}%</td>
                          <td className="py-4 text-right text-zinc-900">${corresponde.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                          <td className="py-4 text-right text-amber-600">-${totalAdelantos.toLocaleString()}</td>
                          <td className={`py-4 text-right font-bold ${neto >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            ${neto.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    // Liquidación Guardada
                    liquidaciones?.map((liq: any) => (
                      <tr key={liq.id}>
                        <td className="py-4 font-medium text-zinc-900">{liq.socios?.nombre}</td>
                        <td className="py-4 text-right text-zinc-500">{Number(liq.porcentaje_aplicado)}%</td>
                        <td className="py-4 text-right text-zinc-900">${Number(liq.valor_correspondiente).toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                        <td className="py-4 text-right text-amber-600">-${Number(liq.adelantos_descontados).toLocaleString()}</td>
                        <td className={`py-4 text-right font-bold ${Number(liq.valor_neto_pagar) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          ${Number(liq.valor_neto_pagar).toLocaleString(undefined, {maximumFractionDigits: 0})}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}






