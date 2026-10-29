import { requireRoles } from '@/lib/utils/authz'
import { formatearFechaIso } from '@/lib/utils/fechas'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Wallet, Lock, Calculator, Undo2 } from 'lucide-react'
import { AdelantoForm } from './AdelantoForm'
import { DevolucionAdelantoForm } from './DevolucionAdelantoForm'
import { GenerarLiquidacionBtn } from './GenerarLiquidacionBtn'
import { ResumenPorCuentaInteractivo } from './ResumenPorCuentaInteractivo'
import { ExportarLiquidacion } from '@/components/liquidaciones/ExportarLiquidacion'
import { ImagenAdelantosSocio } from './ImagenAdelantosSocio'
import { agruparAdelantosConDevoluciones, agruparAdelantosPorSocio, agruparPorMetodo, construirDetallesResumenPorCuenta, MetodoPago, metodosDelResumen } from '@/lib/utils/liquidaciones'
import { cargarMediosPago, mediosConocidos } from '@/lib/medios-pago'
import { fechaHoyBogota } from '@/lib/utils/fechas'
import { esAnuladoCompleto, filtrarIngresosOperativos, filtrarIngresosRealesSaldoAFavor, sumarMontos } from '@/lib/utils/contable'
import type { PagoRecord } from '@/lib/utils/contable'
import { pesos } from '@/lib/utils/pesos'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DetallePeriodoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireRoles(['admin'])

  const { data: periodo } = await supabase?.from('periodos').select('*').eq('id', id).single() || { data: null }
  if (!periodo) notFound()

  // Socios activos
  const { data: socios } = await supabase?.from('socios').select('id, nombre, porcentaje_participacion').eq('activo', true) || { data: [] }

  // Adelantos y sus devoluciones. OJO: `adelantos` lleva AMBAS cosas, porque las
  // devoluciones se guardan como movimiento negativo del mismo adelanto y todas
  // las cuentas de abajo (resumen por cuenta, proyeccion por socio, exportes)
  // salen de sumar `monto` con su signo. Filtrar aqui las devoluciones haria que
  // la plata devuelta no se descontara.
  const { data: adelantosData } = await supabase
    ?.from('adelantos_socios')
    .select('*, socios(nombre)')
    .eq('periodo_id', id)
    .order('fecha', { ascending: false }) || { data: [] }
  const adelantos = adelantosData || []
  // Solo para mostrar: cada adelanto con lo que ya devolvieron y lo que queda.
  const { adelantos: adelantosConDevoluciones, devolucionesHuerfanas } =
    agruparAdelantosConDevoluciones(adelantos)
  const adelantosPorSocio = agruparAdelantosPorSocio(adelantosConDevoluciones)
  const hoyBogota = fechaHoyBogota()
  const fechaSugeridaDevolucion =
    hoyBogota < periodo.fecha_inicio ? periodo.fecha_inicio : hoyBogota > periodo.fecha_fin ? periodo.fecha_fin : hoyBogota

  // Lo que se convierte en la imagen que se le manda a cada socio.
  const sociosParaImagen = adelantosPorSocio.map((socio) => ({
    socioId: socio.socioId,
    nombre: socio.nombre,
    entregado: socio.entregado,
    devuelto: socio.devuelto,
    pendiente: socio.pendiente,
    adelantos: socio.adelantos.map(({ adelanto, devoluciones, entregado, devuelto, pendiente }) => ({
      fecha: String(adelanto.fecha || ''),
      monto: entregado,
      metodo: String(adelanto.metodo_pago || 'otro'),
      notas: adelanto.notas || null,
      devuelto,
      pendiente,
      devoluciones: devoluciones.map((devolucion) => ({
        fecha: String(devolucion.fecha || ''),
        monto: Math.abs(Number(devolucion.monto) || 0),
        metodo: String(devolucion.metodo_pago || 'otro'),
        notas: devolucion.notas || null,
      })),
    })),
  }))

  // Liquidaciones (si está cerrado)
  const { data: liquidacionesData } = await supabase
    ?.from('liquidaciones_socios')
    .select('*, socios(nombre)')
    .eq('periodo_id', id) || { data: [] }
  const liquidaciones = liquidacionesData || []

  const { data: rawAbonos, error: abonosError } = await supabase
    .from('pagos_abonos')
    .select('id, monto, metodo_pago, origen_fondos, estado, notas, fecha_pago, cuentas_por_cobrar(concepto, asistentes(nombre))')
    .gte('fecha_pago', periodo.fecha_inicio)
    .lte('fecha_pago', periodo.fecha_fin)
  if (abonosError) console.error('Error al consultar abonos:', abonosError)

  const { data: rawSaldoFavor, error: saldoFavorError } = await supabase
    .from('movimientos_saldo_favor')
    .select('id, monto, metodo_pago, tipo, notas, fecha, asistentes(nombre), cuentas_por_cobrar(concepto)')
    .gte('fecha', periodo.fecha_inicio)
    .lte('fecha', periodo.fecha_fin)
  if (saldoFavorError) console.error('Error al consultar ingresos reales de saldo a favor:', saldoFavorError)

  const { data: rawDonaciones, error: donacionesError } = await supabase
    .from('donaciones_asistentes')
    .select('id, monto, estado, notas, metodo_pago, fecha, asistentes(nombre)')
    .gte('fecha', periodo.fecha_inicio)
    .lte('fecha', periodo.fecha_fin)
  if (donacionesError) console.error('Error al consultar donaciones:', donacionesError)

  const { data: rawVentasExternas, error: ventasExternasError } = await supabase
    .from('ventas_externas')
    .select('id, comprador_nombre, concepto, monto, estado, notas, metodo_pago, fecha')
    .gte('fecha', periodo.fecha_inicio)
    .lte('fecha', periodo.fecha_fin)
  if (ventasExternasError) console.error('Error al consultar ventas externas:', ventasExternasError)

  const { data: rawEgresosData, error: egresosError } = await supabase
    .from('egresos')
    .select('id, concepto, categoria, monto, estado, notas, metodo_pago, fecha')
    .gte('fecha', periodo.fecha_inicio)
    .lte('fecha', periodo.fecha_fin)
  if (egresosError) console.error('Error al consultar egresos:', egresosError)

  // Traslados entre cuentas propias: no son ingreso ni gasto, solo mueven el saldo de cada cuenta.
  const { data: rawTraslados, error: trasladosError } = await supabase
    .from('traslados_cuentas')
    .select('id, fecha, monto, metodo_origen, metodo_destino, notas, estado')
    .gte('fecha', periodo.fecha_inicio)
    .lte('fecha', periodo.fecha_fin)
  if (trasladosError) console.error('Error al consultar traslados:', trasladosError)
  const trasladosPeriodo = rawTraslados || []
  await cargarMediosPago(supabase)

  const abonosPeriodo = rawAbonos || []
  const saldoFavorPeriodo = rawSaldoFavor || []
  const donacionesPeriodo = rawDonaciones || []
  const ventasExternasPeriodo = rawVentasExternas || []
  const egresosPeriodoRaw = rawEgresosData || []
  const detallesResumen = construirDetallesResumenPorCuenta({
    abonos: abonosPeriodo,
    ingresosSaldoFavor: saldoFavorPeriodo,
    donaciones: donacionesPeriodo,
    ventasExternas: ventasExternasPeriodo,
    egresos: egresosPeriodoRaw,
    adelantos,
    traslados: trasladosPeriodo,
  })

  // Cálculos en vivo si está abierto
  let ingresos_cobrados = 0
  let donaciones_periodo = 0
  let ventas_externas_periodo = 0
  let ingresos_operativos = 0
  let egresos_periodo = 0
  let adelantos_periodo = 0
  let ingresosData: PagoRecord[] = []
  let ingresosSaldoFavorData: PagoRecord[] = []
  let donacionesValidas: PagoRecord[] = []
  let egresosData: PagoRecord[] = []
  let resumenPorCuenta: {
    metodo_pago: MetodoPago
    total_ingresos: number
    total_salidas: number
    saldo_neto_periodo: number
    ingresos_abonos?: number
    ingresos_donaciones?: number
    ingresos_ventas_externas?: number
    salidas_egresos?: number
    salidas_adelantos?: number
    traslados_entrada?: number
    traslados_salida?: number
  }[] = []
  let resumenTotales = { total_ingresos: 0, total_salidas: 0, saldo_neto_periodo: 0 }

  if (periodo.estado === 'abierto') {
    ingresosData =
      filtrarIngresosOperativos(abonosPeriodo).map((a) => ({
        monto: a.monto,
        metodo_pago: a.metodo_pago,
        origen_fondos: a.origen_fondos,
        estado: a.estado,
        notas: a.notas,
      })) || []

    ingresosSaldoFavorData =
      filtrarIngresosRealesSaldoAFavor(saldoFavorPeriodo).map((m) => ({
        monto: m.monto,
        metodo_pago: m.metodo_pago,
        tipo: m.tipo,
        notas: m.notas,
      })) || []

    ingresos_cobrados = Math.round(sumarMontos([...ingresosData, ...ingresosSaldoFavorData]))

    donacionesValidas = donacionesPeriodo.filter((d) => !esAnuladoCompleto(d))
    donaciones_periodo = Math.round(donacionesValidas.reduce((acc: number, curr) => acc + Number(curr.monto), 0))

    const ventasExternasValidas = ventasExternasPeriodo.filter((v) => !esAnuladoCompleto(v))
    ventas_externas_periodo = Math.round(
      ventasExternasValidas.reduce((acc: number, curr) => acc + Number(curr.monto), 0)
    )

    egresosData = egresosPeriodoRaw.filter((item) => !esAnuladoCompleto(item))
    const egresosValidos = Math.round(egresosData.reduce((acc, curr) => acc + Number(curr.monto), 0))
    adelantos_periodo = Math.round(adelantos.reduce((acc: number, curr) => acc + Number(curr.monto), 0))
    egresos_periodo = egresosValidos

    ingresos_operativos = ingresos_cobrados + donaciones_periodo + ventas_externas_periodo

    const { resumen, totales } = agruparPorMetodo({
      abonos: ingresosData,
      ingresosSaldoFavor: ingresosSaldoFavorData,
      donaciones: donacionesValidas,
      ventasExternas: ventasExternasValidas,
      egresos: egresosData,
      adelantos,
      traslados: trasladosPeriodo,
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

    // Las cuentas de hoy y cualquier otra que haya quedado congelada en el cierre.
    const metodosCierre = Array.from(
      new Set([...metodosDelResumen(), ...(resumenDb || []).map((r) => String(r.metodo_pago))])
    )
    const base = metodosCierre.map((m) => ({
      metodo_pago: m,
      total_ingresos: 0,
      total_salidas: 0,
      saldo_neto_periodo: 0,
    }))
    resumenPorCuenta = base.map((item) => {
      const row = (resumenDb || []).find((r) => r.metodo_pago === item.metodo_pago)
      return row
        ? {
            metodo_pago: item.metodo_pago,
            total_ingresos: Number(row.total_ingresos),
            total_salidas: Number(row.total_salidas),
            saldo_neto_periodo: Number(row.saldo_neto_periodo),
            ingresos_abonos: Number(row.ingresos_abonos ?? 0),
            ingresos_donaciones: Number(row.ingresos_donaciones ?? 0),
            ingresos_ventas_externas: Number(row.ingresos_ventas_externas ?? 0),
            salidas_egresos: Number(row.salidas_egresos ?? 0),
            salidas_adelantos: Number(row.salidas_adelantos ?? 0),
            traslados_entrada: Number(row.traslados_entrada ?? 0),
            traslados_salida: Number(row.traslados_salida ?? 0),
          }
        : item
    })
    adelantos_periodo = Math.round(
      resumenPorCuenta.reduce((acc: number, row) => acc + Number(row.salidas_adelantos ?? 0), 0)
    )
    egresos_periodo = Math.round(
      resumenPorCuenta.reduce((acc: number, row) => acc + Number(row.salidas_egresos ?? 0), 0)
    )
    ventas_externas_periodo = Math.round(
      resumenPorCuenta.reduce((acc: number, row) => acc + Number(row.ingresos_ventas_externas ?? 0), 0)
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

  // Se muestran las cuentas activas y, de las ocultas, solo las que tuvieron movimiento.
  const activas = new Set(mediosConocidos().filter((m) => m.activo).map((m) => m.clave))
  resumenPorCuenta = resumenPorCuenta.filter(
    (r) =>
      activas.has(r.metodo_pago) ||
      [r.total_ingresos, r.total_salidas, r.salidas_adelantos, r.traslados_entrada, r.traslados_salida].some(
        (v) => Math.abs(Number(v ?? 0)) > 0.005
      )
  )

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
        const adelantosSocio = adelantos.filter((a) => a.socio_id === socio.id)
        const totalAdelantos = adelantosSocio.reduce((acc: number, curr) => acc + Number(curr.monto), 0)
        return {
          id: socio.id,
          nombre: socio.nombre ?? 'Sin nombre',
          porcentaje,
          corresponde,
          adelantos: totalAdelantos,
          neto: corresponde - totalAdelantos
        }
      }) || []
    : liquidaciones?.map((liq) => ({
        id: liq.id,
        nombre: liq.socios?.nombre ?? 'Sin nombre',
        porcentaje: Number(liq.porcentaje_aplicado),
        corresponde: Number(liq.valor_correspondiente),
        adelantos: Number(liq.adelantos_descontados),
        neto: Number(liq.valor_neto_pagar)
      })) || []

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/liquidaciones" className="p-2 text-gris hover:text-tinta hover:bg-suave-2 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">{periodo.nombre}</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium 
                ${periodo.estado === 'abierto' ? 'bg-verde/15 text-verde' : 'bg-suave-2 text-tinta'}`}>
                {periodo.estado === 'cerrado' && <Lock className="w-3 h-3" />}
                {periodo.estado.toUpperCase()}
              </span>
            </div>
            <p className="text-gris text-sm mt-1">
              {formatearFechaIso(periodo.fecha_inicio)} - {formatearFechaIso(periodo.fecha_fin)}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
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
        <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6">
          <p className="text-sm text-gris">Ingresos cobrados (cartera)</p>
          <p className="text-2xl font-semibold text-verde mt-2">{pesos(ingresos_cobrados)}</p>
        </div>
        <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6">
          <p className="text-sm text-gris">Donaciones</p>
          <p className="text-2xl font-semibold text-verde mt-2">{pesos(donaciones_periodo)}</p>
        </div>
        <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6">
          <p className="text-sm text-gris">Ingresos totales</p>
          <p className="text-2xl font-semibold text-verde mt-2">{pesos(ingresos_operativos)}</p>
        </div>
        <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6">
          <p className="text-sm text-gris">Egresos del Período</p>
          <p className="text-2xl font-semibold text-rojo mt-2">{pesos(egresos_periodo)}</p>
        </div>
        <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6">
          <p className="text-sm text-gris">Utilidad Neta a Repartir</p>
          <p className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem] mt-2">{pesos(utilidad_neta)}</p>
        </div>
      </div>

      <ResumenPorCuentaInteractivo
        periodo={{
          nombre: periodo.nombre,
          estado: periodo.estado,
          fecha_inicio: periodo.fecha_inicio,
          fecha_fin: periodo.fecha_fin,
        }}
        resumenPorCuenta={resumenPorCuenta}
        resumenTotales={resumenTotales}
        adelantosPeriodo={adelantos_periodo}
        detalles={detallesResumen}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda: Adelantos y Formulario */}
        <div className="lg:col-span-1 space-y-6">
          {periodo.estado === 'abierto' ? (
            <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-5 h-5 text-gris" />
                <h3 className="font-semibold text-tinta">Registrar Adelanto</h3>
              </div>
              <AdelantoForm periodoId={periodo.id} socios={socios || []} />
            </div>
          ) : (
            <div className="bg-suave p-6 rounded-xl border border-linea text-center">
              <Lock className="w-8 h-8 text-gris mx-auto mb-3" />
              <h3 className="font-semibold text-tinta mb-1">Período Cerrado</h3>
              <p className="text-sm text-gris">No se pueden registrar más adelantos en este Período.</p>
            </div>
          )}

          {periodo.estado === 'abierto' && (
            <div className="rounded-2xl border border-linea bg-panel p-5 md:p-6">
              <div className="flex items-center gap-2 mb-1">
                <Undo2 className="w-5 h-5 text-gris" />
                <h3 className="font-semibold text-tinta">Registrar Devolución</h3>
              </div>
              <p className="mb-4 text-xs text-gris">
                Pones cuánto devolvió y el ERP lo reparte entre sus adelantos, del más antiguo al más nuevo.
              </p>
              <DevolucionAdelantoForm
                periodoId={periodo.id}
                socios={adelantosPorSocio.map((s) => ({ id: s.socioId, nombre: s.nombre, pendiente: s.pendiente }))}
                fechaMinima={periodo.fecha_inicio}
                fechaMaxima={periodo.fecha_fin}
                fechaSugerida={fechaSugeridaDevolucion}
              />
            </div>
          )}

          {sociosParaImagen.length > 0 && (
            <div className="rounded-2xl border border-linea bg-panel overflow-hidden">
              <div className="p-4 border-b border-linea bg-suave">
                <h3 className="font-semibold text-tinta">Estado por socio</h3>
                <p className="mt-0.5 text-xs text-gris">
                  Descarga la imagen de una persona y se la mandas: explica sola cuánto se le adelantó, qué ha devuelto
                  y qué queda.
                </p>
              </div>
              <ImagenAdelantosSocio
                socios={sociosParaImagen}
                empresa={{ nombre: empresa.nombre, nit: empresa.nit }}
                periodo={{ nombre: periodo.nombre, fecha_inicio: periodo.fecha_inicio, fecha_fin: periodo.fecha_fin }}
              />
            </div>
          )}

          <div className="rounded-2xl border border-linea bg-panel overflow-hidden">
            <div className="p-4 border-b border-linea bg-suave">
              <h3 className="font-semibold text-tinta">Adelantos Registrados</h3>
              <p className="mt-0.5 text-xs text-gris">
                Uno por uno, con lo que ya devolvieron de cada uno.
              </p>
            </div>
            <div className="divide-y divide-linea max-h-[500px] overflow-y-auto">
              {adelantosConDevoluciones.map(({ adelanto, devoluciones, entregado, devuelto, pendiente }) => (
                <div key={adelanto.id} className="p-4 hover:bg-suave/50">
                  <div className="flex justify-between items-start mb-1">
                    <p className="font-medium text-tinta text-sm">{adelanto.socios?.nombre}</p>
                    <p className="font-semibold text-ambar text-sm">{pesos(entregado)}</p>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gris">
                    <p>{formatearFechaIso(adelanto.fecha)}</p>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-suave-2 text-gris border border-linea">
                        {adelanto.metodo_pago || 'otro'}
                      </span>
                      <p className="truncate max-w-[120px]">{adelanto.notas}</p>
                    </div>
                  </div>

                  {devuelto > 0 && (
                    <div className="mt-2 rounded-lg bg-verde/10 border border-verde/30 p-2 space-y-1">
                      <div className="flex justify-between text-xs font-medium text-verde">
                        <span>Devuelto</span>
                        <span>{pesos(-(devuelto))}</span>
                      </div>
                      {devoluciones.map((devolucion) => (
                        <div key={devolucion.id} className="flex justify-between text-xs text-verde/80">
                          <span>
                            {formatearFechaIso(devolucion.fecha)} · {devolucion.metodo_pago || 'otro'}
                            {devolucion.notas ? ` · ${devolucion.notas}` : ''}
                          </span>
                          <span>{pesos(Math.abs(Number(devolucion.monto)))}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-semibold text-tinta pt-1 border-t border-verde/30">
                        <span>{pendiente > 0 ? 'Queda del adelanto' : 'Devuelto completo'}</span>
                        <span>{pesos(pendiente)}</span>
                      </div>
                    </div>
                  )}

                  {devuelto === 0 && periodo.estado === 'abierto' && (
                    <p className="mt-1 text-xs text-gris">Sin devoluciones todavía</p>
                  )}
                </div>
              ))}

              {devolucionesHuerfanas.map((devolucion) => (
                <div key={devolucion.id} className="p-4 bg-verde/4">
                  <div className="flex justify-between items-start mb-1">
                    <p className="font-medium text-tinta text-sm">{devolucion.socios?.nombre}</p>
                    <p className="font-semibold text-verde text-sm">
                      {pesos(-(Math.abs(Number(devolucion.monto))))}
                    </p>
                  </div>
                  <p className="text-xs text-gris">
                    Devolución del {formatearFechaIso(devolucion.fecha)} — su adelanto quedó en otro período.
                  </p>
                </div>
              ))}

              {!adelantos.length && (
                <div className="p-8 text-center text-sm text-gris">
                  No hay adelantos en este Período.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Columna Derecha: Proyección / Liquidación Final */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-linea bg-panel overflow-hidden h-full flex flex-col">
            <div className="p-6 border-b border-linea bg-suave flex items-center gap-2">
              <Calculator className="w-5 h-5 text-gris" />
              <h3 className="font-semibold text-tinta">
                {periodo.estado === 'abierto' ? 'Proyección de Liquidación' : 'Liquidación Final'}
              </h3>
            </div>
            <div className="p-6 flex-1 overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-gris font-medium border-b border-linea">
                  <tr>
                    <th className="pb-3">Socio</th>
                    <th className="pb-3 text-right">%</th>
                    <th className="pb-3 text-right">Corresponde</th>
                    <th className="pb-3 text-right text-ambar">Adelantos</th>
                    <th className="pb-3 text-right font-bold text-tinta">Neto a Pagar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {periodo.estado === 'abierto' ? (
                    // Proyección en vivo
                    socios?.map(socio => {
                      const porcentaje = Number(socio.porcentaje_participacion)
                      const corresponde = (utilidad_neta * porcentaje) / 100
                      const adelantosSocio = adelantos.filter((a) => a.socio_id === socio.id)
                      const totalAdelantos = adelantosSocio.reduce((acc: number, curr) => acc + Number(curr.monto), 0)
                      const neto = corresponde - totalAdelantos

                      return (
                        <tr key={socio.id}>
                          <td className="py-4 font-medium text-tinta">{socio.nombre}</td>
                          <td className="py-4 text-right text-gris">{porcentaje}%</td>
                          <td className="py-4 text-right text-tinta">{pesos(corresponde)}</td>
                          <td className={`py-4 text-right ${totalAdelantos > 0 ? 'text-ambar' : 'text-gris'}`}>{pesos(-(totalAdelantos))}</td>
                          <td className={`py-4 text-right font-bold ${neto >= 0 ? 'text-verde' : 'text-rojo'}`}>
                            {pesos(neto)}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    // Liquidación Guardada
                    liquidaciones?.map((liq) => (
                      <tr key={liq.id}>
                        <td className="py-4 font-medium text-tinta">{liq.socios?.nombre}</td>
                        <td className="py-4 text-right text-gris">{Number(liq.porcentaje_aplicado)}%</td>
                        <td className="py-4 text-right text-tinta">{pesos(Number(liq.valor_correspondiente))}</td>
                        <td className={`py-4 text-right ${Number(liq.adelantos_descontados) > 0 ? 'text-ambar' : 'text-gris'}`}>{pesos(-(Number(liq.adelantos_descontados)))}</td>
                        <td className={`py-4 text-right font-bold ${Number(liq.valor_neto_pagar) >= 0 ? 'text-verde' : 'text-rojo'}`}>
                          {pesos(Number(liq.valor_neto_pagar))}
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






