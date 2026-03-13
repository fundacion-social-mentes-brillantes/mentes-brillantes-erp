import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Wallet, Lock, Calculator } from 'lucide-react'
import { AdelantoForm } from './AdelantoForm'
import { GenerarLiquidacionBtn } from './GenerarLiquidacionBtn'
import { ExportarLiquidacion } from '@/components/liquidaciones/ExportarLiquidacion'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DetallePeriodoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!supabase) return <div>Error de conexión a la base de datos</div>
  
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
  let ingresos_cobrados = 0;
  let egresos_periodo = 0;

  if (periodo.estado === 'abierto') {
    const { data: ingresosData } = await supabase
      ?.from('pagos_abonos')
      .select('monto')
      .gte('fecha_pago', periodo.fecha_inicio)
      .lte('fecha_pago', periodo.fecha_fin) || { data: [] }
    ingresos_cobrados = ingresosData?.reduce((acc, curr) => acc + Number(curr.monto), 0) || 0

    const { data: egresosData } = await supabase
      ?.from('egresos')
      .select('monto')
      .gte('fecha', periodo.fecha_inicio)
      .lte('fecha', periodo.fecha_fin) || { data: [] }
    egresos_periodo = egresosData?.reduce((acc, curr) => acc + Number(curr.monto), 0) || 0
  } else if (liquidaciones && liquidaciones.length > 0) {
    ingresos_cobrados = Number(liquidaciones[0].ingresos_cobrados)
    egresos_periodo = Number(liquidaciones[0].egresos_periodo)
  }

  const utilidad_neta = ingresos_cobrados - egresos_periodo

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
              ingresos: ingresos_cobrados,
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
          <p className="text-sm text-zinc-500">Ingresos Cobrados</p>
          <p className="text-2xl font-semibold text-emerald-600 mt-2">${ingresos_cobrados.toLocaleString()}</p>
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
              <p className="text-sm text-zinc-500">No se pueden registrar más adelantos en este período.</p>
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
                    <p className="truncate max-w-[120px]">{adelanto.notas}</p>
                  </div>
                </div>
              ))}
              {!adelantos.length && (
                <div className="p-8 text-center text-sm text-zinc-500">
                  No hay adelantos en este período.
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
