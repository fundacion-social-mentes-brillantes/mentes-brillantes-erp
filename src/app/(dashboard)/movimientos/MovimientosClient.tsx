'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Search, 
  Filter, 
  ArrowDownRight, 
  ArrowUpRight, 
  Wallet, 
  Receipt,
  ArrowRightLeft,
  Calendar,
  XCircle,
  Trash2
} from 'lucide-react'
import { anularMovimiento } from './actions'

type Asistente = {
  id: string
  nombre: string
}

type Movimiento = {
  movimiento_id: string
  fecha: string
  tipo_movimiento: 'cuenta_cobrar' | 'abono' | 'anticipo' | 'aplicacion_saldo' | 'egreso'
  asistente_id: string | null
  asistente_nombre: string | null
  concepto: string
  metodo_pago: string | null
  valor_deuda: number
  valor_ingreso: number
  valor_egreso: number
  estado_o_saldo: string | null
  notas: string | null
  creado_en: string
}

export function MovimientosClient({ asistentes }: { asistentes: Asistente[] }) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [rangoFecha, setRangoFecha] = useState<'este_mes' | 'mes_pasado' | 'todos' | 'custom'>('este_mes')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [asistenteFiltro, setAsistenteFiltro] = useState('todos')
  const [metodoFiltro, setMetodoFiltro] = useState('todos')
  const [mostrarAplicaciones, setMostrarAplicaciones] = useState(false)
  const [isAnulando, setIsAnulando] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    // Set default dates for "este_mes" on initial load
    if (rangoFecha === 'este_mes') {
      const now = new Date()
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      
      setFechaInicio(firstDay.toISOString().split('T')[0])
      setFechaFin(lastDay.toISOString().split('T')[0])
    }
  }, [])

  useEffect(() => {
    if (rangoFecha === 'este_mes') {
      const now = new Date()
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      setFechaInicio(firstDay.toISOString().split('T')[0])
      setFechaFin(lastDay.toISOString().split('T')[0])
    } else if (rangoFecha === 'mes_pasado') {
      const now = new Date()
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
      setFechaInicio(firstDay.toISOString().split('T')[0])
      setFechaFin(lastDay.toISOString().split('T')[0])
    } else if (rangoFecha === 'todos') {
      setFechaInicio('')
      setFechaFin('')
    }
  }, [rangoFecha])

  useEffect(() => {
    fetchMovimientos()
  }, [fechaInicio, fechaFin, tipoFiltro, asistenteFiltro, metodoFiltro, mostrarAplicaciones])

  async function fetchMovimientos() {
    if (!supabase) return
    setLoading(true)
    
    let query = supabase
      .from('vw_movimientos_generales')
      .select('*')
      
    if (fechaInicio) {
      query = query.gte('fecha', fechaInicio)
    }
    if (fechaFin) {
      query = query.lte('fecha', fechaFin)
    }
    if (tipoFiltro !== 'todos') {
      query = query.eq('tipo_movimiento', tipoFiltro)
    }
    if (asistenteFiltro !== 'todos') {
      query = query.eq('asistente_id', asistenteFiltro)
    }
    if (metodoFiltro !== 'todos') {
      query = query.eq('metodo_pago', metodoFiltro)
    }

    // Order by date descending, then by created_at descending
    query = query.order('fecha', { ascending: false }).order('creado_en', { ascending: false })

    const { data, error } = await query

    if (!error && data) {
      let result = data as Movimiento[]
      if (!mostrarAplicaciones) {
        result = result.filter(m => 
          m.tipo_movimiento !== 'aplicacion_saldo' && 
          m.metodo_pago?.toLowerCase() !== 'saldo_a_favor'
        )
      }
      setMovimientos(result)
    }
    setLoading(false)
  }

  const formatCurrency = (amount: number) => {
    if (!amount) return '$0'
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'cuenta_cobrar': return <Receipt className="w-4 h-4 text-blue-500" />
      case 'abono': return <ArrowDownRight className="w-4 h-4 text-emerald-500" />
      case 'anticipo': return <Wallet className="w-4 h-4 text-emerald-500" />
      case 'aplicacion_saldo': return <ArrowRightLeft className="w-4 h-4 text-amber-500" />
      case 'egreso': return <ArrowUpRight className="w-4 h-4 text-red-500" />
      default: return <Receipt className="w-4 h-4 text-zinc-500" />
    }
  }

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case 'cuenta_cobrar': return 'Cuenta por Cobrar'
      case 'abono': return 'Abono / Ingreso'
      case 'anticipo': return 'Anticipo'
      case 'aplicacion_saldo': return 'Aplicación Saldo'
      case 'egreso': return 'Egreso'
      default: return tipo
    }
  }

  const getTipoBadgeColor = (tipo: string) => {
    switch (tipo) {
      case 'cuenta_cobrar': return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'abono': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'anticipo': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'aplicacion_saldo': return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'egreso': return 'bg-red-50 text-red-700 border-red-200'
      default: return 'bg-zinc-50 text-zinc-700 border-zinc-200'
    }
  }

  const handleAnular = async (mov: Movimiento) => {
    if (!window.confirm('¿Estás seguro de anular este movimiento? Esto revertirá el pago en la deuda del asistente (o la entrada de dinero si es anticipo/egreso).')) return;
    
    setIsAnulando(mov.movimiento_id)
    try {
      // Necesitamos el monto real para revertirlo.
      // Si es ingreso o cobro, usamos valor_ingreso. Si es egreso, usamos valor_egreso.
      let monto_revertir = 0;
      if (mov.tipo_movimiento === 'egreso') monto_revertir = mov.valor_egreso;
      else monto_revertir = mov.valor_ingreso; // abono, anticipo, aplicacion_saldo

      const result = await anularMovimiento(
        mov.movimiento_id,
        mov.tipo_movimiento,
        monto_revertir,
        mov.asistente_id
      )
      
      if (result?.error) {
        alert(result.error)
      } else {
        alert('Movimiento anulado correctamente.')
        await fetchMovimientos()
      }
    } catch (error) {
      console.error(error)
      alert('Error inesperado al anular')
    } finally {
      setIsAnulando(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 mb-2">
          <Filter className="w-4 h-4" />
          Filtros
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Rango de Fechas */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-500">Periodo</label>
            <select 
              value={rangoFecha}
              onChange={(e) => setRangoFecha(e.target.value as any)}
              className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="este_mes">Este mes</option>
              <option value="mes_pasado">Mes pasado</option>
              <option value="todos">Todos los tiempos</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          {/* Fechas Custom */}
          {rangoFecha === 'custom' && (
            <div className="space-y-1.5 lg:col-span-2 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-zinc-500">Desde</label>
                <input 
                  type="date" 
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Hasta</label>
                <input 
                  type="date" 
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                />
              </div>
            </div>
          )}

          {/* Tipo de Movimiento */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-500">Tipo</label>
            <select 
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="todos">Todos los tipos</option>
              <option value="cuenta_cobrar">Cuentas por Cobrar</option>
              <option value="abono">Abonos / Ingresos</option>
              <option value="anticipo">Anticipos</option>
              <option value="aplicacion_saldo">Aplicación de Saldo</option>
              <option value="egreso">Egresos</option>
            </select>
          </div>

          {/* Asistente */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-500">Asistente</label>
            <select 
              value={asistenteFiltro}
              onChange={(e) => setAsistenteFiltro(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="todos">Todos los asistentes</option>
              {asistentes.map(a => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>

          {/* Método de Pago */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-500">Método de Pago</label>
            <select 
              value={metodoFiltro}
              onChange={(e) => setMetodoFiltro(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="todos">Todos los métodos</option>
              <option value="efectivo">Efectivo</option>
              <option value="nequi">Nequi</option>
              <option value="daviplata">Daviplata</option>
              {mostrarAplicaciones && <option value="saldo_a_favor">Saldo a Favor</option>}
              <option value="otro">Otro</option>
            </select>
          </div>
          
          {/* Mostrar Aplicaciones de Saldo */}
          <div className="lg:col-span-5 flex items-center justify-end mt-2 pt-4 border-t border-zinc-100">
            <label className="flex items-center gap-2 cursor-pointer relative">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={mostrarAplicaciones}
                onChange={(e) => setMostrarAplicaciones(e.target.checked)}
              />
              <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none ring-offset-2 peer-focus:ring-2 peer-focus:ring-zinc-900 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-zinc-900"></div>
              <span className="text-sm font-medium text-zinc-700">Mostrar aplicaciones de saldo</span>
            </label>
          </div>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 text-zinc-500 font-medium border-b border-zinc-200">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Asistente</th>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3 text-right">Valor Deuda</th>
                <th className="px-4 py-3 text-right">Ingreso</th>
                <th className="px-4 py-3 text-right">Egreso</th>
                <th className="px-4 py-3">Estado/Notas</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                    <div className="flex justify-center items-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-zinc-300 border-t-zinc-900 animate-spin" />
                      Cargando movimientos...
                    </div>
                  </td>
                </tr>
              ) : movimientos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                    No se encontraron movimientos con los filtros actuales.
                  </td>
                </tr>
              ) : (
                movimientos.map((mov) => (
                  <tr key={`${mov.movimiento_id}-${mov.tipo_movimiento}`} className={`hover:bg-zinc-50/50 transition-colors ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'opacity-50 grayscale' : ''}`}>
                    <td className={`px-4 py-3 whitespace-nowrap ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'line-through text-zinc-400' : 'text-zinc-600'}`}>
                      {new Date(mov.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${getTipoBadgeColor(mov.tipo_movimiento)}`}>
                        {getTipoIcon(mov.tipo_movimiento)}
                        {getTipoLabel(mov.tipo_movimiento)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {mov.asistente_nombre || <span className="text-zinc-400 italic">N/A</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 max-w-[200px] truncate" title={mov.concepto}>
                      <span className={mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'line-through' : ''}>{mov.concepto}</span>
                    </td>
                    <td className="px-4 py-3">
                      {mov.metodo_pago ? (
                        <span className="capitalize text-zinc-600 bg-zinc-100 px-2 py-1 rounded-md text-xs border border-zinc-200">
                          {mov.metodo_pago.replace('_', ' ')}
                        </span>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'text-zinc-400 line-through' : 'text-blue-600'}`}>
                      {mov.valor_deuda > 0 ? formatCurrency(mov.valor_deuda) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {mov.valor_ingreso > 0 ? (
                        <span className={`flex items-center justify-end gap-1.5 ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'text-zinc-400 line-through' : ((mov.tipo_movimiento === 'aplicacion_saldo' || mov.metodo_pago?.toLowerCase() === 'saldo_a_favor') ? 'text-zinc-500' : 'text-emerald-600')}`}>
                          {(mov.tipo_movimiento === 'aplicacion_saldo' || mov.metodo_pago?.toLowerCase() === 'saldo_a_favor') && <span title="Ajuste contable (Saldo a Favor)"><ArrowRightLeft className="w-3.5 h-3.5" /></span>}
                          {formatCurrency(mov.valor_ingreso)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'text-zinc-400 line-through' : 'text-red-600'}`}>
                      {mov.valor_egreso > 0 ? formatCurrency(mov.valor_egreso) : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 max-w-[150px] truncate">
                      {mov.estado_o_saldo && (
                        <span className={`capitalize font-medium mr-2 ${mov.estado_o_saldo.toLowerCase() === 'anulado' ? 'text-red-500' : 'text-zinc-700'}`}>
                          [{mov.estado_o_saldo}]
                        </span>
                      )}
                      <span title={mov.notas || ''}>{mov.notas || ''}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {mov.tipo_movimiento !== 'cuenta_cobrar' && mov.estado_o_saldo?.toLowerCase() !== 'anulado' ? (
                        <button
                          onClick={() => handleAnular(mov)}
                          disabled={isAnulando === mov.movimiento_id}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded disabled:opacity-50 transition-colors"
                          title="Anular Movimiento"
                        >
                          {isAnulando === mov.movimiento_id ? (
                            <div className="w-4 h-4 rounded-full border-2 border-red-300 border-t-red-600 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      ) : mov.estado_o_saldo?.toLowerCase() === 'anulado' ? (
                        <span className="text-xs text-red-400 font-medium">Anulado</span>
                      ) : (
                        <span className="text-zinc-300">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="bg-white p-8 rounded-xl border border-zinc-200 text-center text-zinc-500 flex justify-center items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-zinc-300 border-t-zinc-900 animate-spin" />
            Cargando...
          </div>
        ) : movimientos.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-zinc-200 text-center text-zinc-500">
            No hay movimientos.
          </div>
        ) : (
          movimientos.map((mov) => (
            <div key={`${mov.movimiento_id}-${mov.tipo_movimiento}`} className={`bg-white p-4 rounded-xl border border-zinc-200 shadow-sm space-y-3 ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'opacity-60 grayscale' : ''}`}>
              <div className="flex justify-between items-start">
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${getTipoBadgeColor(mov.tipo_movimiento)}`}>
                  {getTipoIcon(mov.tipo_movimiento)}
                  {getTipoLabel(mov.tipo_movimiento)}
                </span>
                <span className={`text-xs font-medium px-2 py-1 rounded-md ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'text-red-500 bg-red-50' : 'text-zinc-500 bg-zinc-100'}`}>
                  {mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'Anulado' : new Date(mov.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                </span>
              </div>
              
              <div>
                <div className={`font-medium ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'line-through text-zinc-500' : 'text-zinc-900'}`}>{mov.concepto}</div>
                {mov.asistente_nombre && (
                  <div className="text-sm text-zinc-500">{mov.asistente_nombre}</div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                <div className="flex flex-col gap-1">
                  {mov.metodo_pago && (
                    <span className="capitalize text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-md text-xs border border-zinc-200 w-fit">
                      {mov.metodo_pago.replace('_', ' ')}
                    </span>
                  )}
                  {mov.estado_o_saldo && mov.estado_o_saldo?.toLowerCase() !== 'anulado' && (
                    <span className="capitalize text-xs font-medium text-zinc-700">
                      Estado: {mov.estado_o_saldo}
                    </span>
                  )}
                </div>
                
                <div className={`text-right ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'line-through opacity-70' : ''}`}>
                  {mov.valor_deuda > 0 && (
                    <div className="font-bold text-blue-600">{formatCurrency(mov.valor_deuda)}</div>
                  )}
                  {mov.valor_ingreso > 0 && (
                    <div className={`font-bold flex items-center justify-end gap-1.5 ${(mov.tipo_movimiento === 'aplicacion_saldo' || mov.metodo_pago?.toLowerCase() === 'saldo_a_favor') ? 'text-zinc-500' : 'text-emerald-600'}`}>
                      {(mov.tipo_movimiento === 'aplicacion_saldo' || mov.metodo_pago?.toLowerCase() === 'saldo_a_favor') && <span title="Ajuste contable (Saldo a Favor)"><ArrowRightLeft className="w-3.5 h-3.5" /></span>}
                      +{formatCurrency(mov.valor_ingreso)}
                    </div>
                  )}
                  {mov.valor_egreso > 0 && (
                    <div className="font-bold text-red-600">-{formatCurrency(mov.valor_egreso)}</div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100">
                {mov.notas ? (
                  <div className="text-xs text-zinc-500 bg-zinc-50 p-2 rounded-md border border-zinc-100 flex-1 mr-2">
                    {mov.notas}
                  </div>
                ) : (
                  <div className="flex-1"></div>
                )}
                
                {mov.tipo_movimiento !== 'cuenta_cobrar' && mov.estado_o_saldo?.toLowerCase() !== 'anulado' && (
                  <button
                    onClick={() => handleAnular(mov)}
                    disabled={isAnulando === mov.movimiento_id}
                    className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md transition-colors"
                  >
                     {isAnulando === mov.movimiento_id ? 'Anulando...' : <><Trash2 className="w-3.5 h-3.5" /> Anular</>}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
