'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
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
  Trash2,
  Pencil,
  Ban,
  Save,
  AlertTriangle,
  ExternalLink
} from 'lucide-react'
import { anularMovimiento, editarMovimiento, eliminarMovimiento } from './actions'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet'

type Asistente = {
  id: string
  nombre: string
}

type Movimiento = {
  movimiento_id: string
  fecha: string
  tipo_movimiento: 'cuenta_cobrar' | 'abono' | 'anticipo' | 'aplicacion_saldo' | 'egreso' | 'donacion'
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
  categoria?: string
}

export function MovimientosClient({ asistentes, isAdmin = false }: { asistentes: Asistente[], isAdmin?: boolean }) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Filters
  const [rangoFecha, setRangoFecha] = useState<'este_mes' | 'mes_pasado' | 'todos' | 'custom'>('este_mes')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [asistenteFiltro, setAsistenteFiltro] = useState('todos')
  const [metodoFiltro, setMetodoFiltro] = useState('todos')
  const [mostrarAplicaciones, setMostrarAplicaciones] = useState(false)

  // Sheet State
  const [selectedMov, setSelectedMov] = useState<Movimiento | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  // Edit State
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isAnulando, setIsAnulando] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const supabase = createClient()
  const movimientoBloqueado = selectedMov?.tipo_movimiento === 'aplicacion_saldo'

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
    setLoadError(null)

    let query = supabase
      .from('vw_movimientos_generales')
      .select('*')

    if (fechaInicio) query = query.gte('fecha', fechaInicio)
    if (fechaFin) query = query.lte('fecha', fechaFin)
    if (tipoFiltro !== 'todos') query = query.eq('tipo_movimiento', tipoFiltro)
    if (asistenteFiltro !== 'todos') query = query.eq('asistente_id', asistenteFiltro)
    if (metodoFiltro !== 'todos') query = query.eq('metodo_pago', metodoFiltro)

    query = query.order('fecha', { ascending: false }).order('creado_en', { ascending: false })

    const { data, error } = await query

    if (error) {
      console.error('Error cargando movimientos:', error)
      setLoadError('No se pudo cargar el historial porque falta la vista de movimientos o hay un problema de conexión. Contacta al administrador.')
    } else if (data) {
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
      case 'donacion': return <ArrowDownRight className="w-4 h-4 text-teal-500" />
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
      case 'donacion': return 'Donación'
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
      case 'donacion': return 'bg-teal-50 text-teal-700 border-teal-200'
      case 'egreso': return 'bg-red-50 text-red-700 border-red-200'
      default: return 'bg-zinc-50 text-zinc-700 border-zinc-200'
    }
  }

  const handleRowClick = (mov: Movimiento) => {
    setSelectedMov(mov)
    // Initialize edit form based on movement type
    setEditForm({
      monto: mov.tipo_movimiento === 'egreso' || mov.tipo_movimiento === 'aplicacion_saldo'
        ? mov.valor_egreso
        : mov.valor_ingreso,
      fecha: mov.fecha,
      concepto: mov.concepto,
      metodo_pago: mov.metodo_pago || '',
      asistente_id: mov.asistente_id || '',
      notas: mov.notas || ''
    })
    setIsEditing(false)
    setIsSheetOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedMov) return
    setIsSaving(true)
    try {
      const result = await editarMovimiento(selectedMov.movimiento_id, selectedMov.tipo_movimiento, editForm)
      if (result?.error) {
        alert(result.error)
      } else {
        setIsSheetOpen(false)
        await fetchMovimientos()
      }
    } catch (e) {
      alert("Error al guardar cambios")
    } finally {
      setIsSaving(false)
    }
  }

  const handleAnular = async () => {
    if (!selectedMov) return
    if (!window.confirm('¿Estás seguro de anular este movimiento?')) return;

    setIsAnulando(true)
    try {
      let monto_revertir = selectedMov.tipo_movimiento === 'egreso' ? selectedMov.valor_egreso : selectedMov.valor_ingreso;
      const result = await anularMovimiento(selectedMov.movimiento_id, selectedMov.tipo_movimiento, monto_revertir, selectedMov.asistente_id)

      if (result?.error) {
        alert(result.error)
      } else {
        setIsSheetOpen(false)
        await fetchMovimientos()
      }
    } catch (error) {
      alert('Error inesperado al anular')
    } finally {
      setIsAnulando(false)
    }
  }

  const handleEliminar = async () => {
    if (!selectedMov) return
    if (!window.confirm('¡ATENCIÓN! Vas a ELIMINAR permanentemente este registro de la base de datos. ¿Estás absolutamente seguro?')) return;
    if (!window.confirm('Segunda confirmación: ¿Este movimiento está duplicado o es un error grave y deseas BORRARLO físicamente?')) return;

    setIsDeleting(true)
    try {
      let monto_revertir = selectedMov.tipo_movimiento === 'egreso' ? selectedMov.valor_egreso : selectedMov.valor_ingreso;
      const result = await eliminarMovimiento(selectedMov.movimiento_id, selectedMov.tipo_movimiento, monto_revertir, selectedMov.asistente_id)

      if (result?.error) {
        alert(result.error)
      } else {
        setIsSheetOpen(false)
        await fetchMovimientos()
      }
    } catch (error) {
      alert('Error inesperado al eliminar')
    } finally {
      setIsDeleting(false)
    }
  }

  const isAsistenteValidForLink = (id: string | null, nombre: string | null) => {
    if (!id) return false
    if (id.toLowerCase() === 'n/a') return false
    if (nombre?.toLowerCase().includes('egreso general')) return false
    if (nombre?.toLowerCase() === 'n/a') return false
    return true
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3">
          {loadError}
        </div>
      )}

      {/* Filters (same as before) */}
      <div className="bg-[rgb(var(--surface-1))] p-4 rounded-xl border border-[rgb(var(--border))] shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--text-primary))] mb-2">
          <Filter className="w-4 h-4" /> Filtros
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Periodo</label>
            <select
              value={rangoFecha}
              onChange={(e) => setRangoFecha(e.target.value as any)}
              className="w-full h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--accent),0.35)]"
            >
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="este_mes">Este mes</option>
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="mes_pasado">Mes pasado</option>
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="todos">Todos los tiempos</option>
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="custom">Personalizado</option>
            </select>
          </div>

          {rangoFecha === 'custom' && (
            <div className="space-y-1.5 lg:col-span-2 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Desde</label>
                <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--accent),0.35)]" />
              </div>
              <div>
                <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Hasta</label>
                <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--accent),0.35)]" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Tipo</label>
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="w-full h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--accent),0.35)]">
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="todos">Todos los tipos</option>
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="cuenta_cobrar">Cuentas por Cobrar</option>
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="abono">Abonos / Ingresos</option>
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="anticipo">Anticipos</option>
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="aplicacion_saldo">Aplicación de Saldo</option>
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="donacion">Donaciones</option>
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="egreso">Egresos</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Asistente</label>
            <select value={asistenteFiltro} onChange={(e) => setAsistenteFiltro(e.target.value)} className="w-full h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--accent),0.35)]">
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="todos">Todos los asistentes</option>
              {asistentes.map(a => <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Método de Pago</label>
            <select value={metodoFiltro} onChange={(e) => setMetodoFiltro(e.target.value)} className="w-full h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1 text-sm text-[rgb(var(--text-primary))] focus:border-[rgb(var(--accent))] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--accent),0.35)]">
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="todos">Todos los métodos</option>
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="efectivo">Efectivo</option>
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="nequi">Nequi</option>
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="daviplata">Daviplata</option>
              {mostrarAplicaciones && <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="saldo_a_favor">Saldo a Favor</option>}
              <option className="bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]" value="otro">Otro</option>
            </select>
          </div>

          <div className="lg:col-span-5 flex items-center justify-end mt-2 pt-4 border-t border-[rgb(var(--border))]">
            <label className="flex items-center gap-2 cursor-pointer relative">
              <input type="checkbox" className="sr-only peer" checked={mostrarAplicaciones} onChange={(e) => setMostrarAplicaciones(e.target.checked)} />
              <div className="w-9 h-5 bg-[rgb(var(--surface-3))] peer-focus:outline-none ring-offset-2 peer-focus:ring-2 peer-focus:ring-[rgb(var(--accent))] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[rgb(var(--accent))]"></div>
              <span className="text-sm font-medium text-[rgb(var(--text-primary))]">Mostrar aplicaciones de saldo</span>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                    <div className="flex justify-center items-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-zinc-300 border-t-zinc-900 animate-spin" />
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : movimientos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">Sin movimientos</td>
                </tr>
              ) : (
                movimientos.map((mov) => (
                  <tr
                    key={`${mov.movimiento_id}-${mov.tipo_movimiento}`}
                    onClick={() => handleRowClick(mov)}
                    className={`hover:bg-zinc-50 cursor-pointer transition-colors ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'opacity-50 grayscale hover:opacity-75' : ''}`}
                  >
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
                      {mov.asistente_nombre ? (
                        isAsistenteValidForLink(mov.asistente_id, mov.asistente_nombre) ? (
                          <Link
                            href={`/asistentes/${mov.asistente_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                          >
                            {mov.asistente_nombre}
                          </Link>
                        ) : (
                          <span>{mov.asistente_nombre}</span>
                        )
                      ) : (
                        <span className="text-zinc-400 italic">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 max-w-[200px] truncate" title={mov.concepto}>
                      <span className={mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'line-through' : ''}>{mov.concepto}</span>
                    </td>
                    <td className="px-4 py-3">
                      {mov.metodo_pago ? (
                        <span className="capitalize text-zinc-600 bg-zinc-100 px-2 py-1 rounded-md text-xs border border-zinc-200">
                          {mov.metodo_pago.replace('_', ' ')}
                        </span>
                      ) : <span className="text-zinc-400">-</span>}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'text-zinc-400 line-through' : 'text-blue-600'}`}>
                      {mov.valor_deuda > 0 ? formatCurrency(mov.valor_deuda) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {mov.valor_ingreso > 0 ? (
                        <span className={`flex items-center justify-end gap-1.5 ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'text-zinc-400 line-through' : ((mov.tipo_movimiento === 'aplicacion_saldo' || mov.metodo_pago?.toLowerCase() === 'saldo_a_favor') ? 'text-zinc-500' : 'text-emerald-600')}`}>
                          {(mov.tipo_movimiento === 'aplicacion_saldo' || mov.metodo_pago?.toLowerCase() === 'saldo_a_favor') && <span title="Ajuste contable"><ArrowRightLeft className="w-3.5 h-3.5" /></span>}
                          {formatCurrency(mov.valor_ingreso)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'text-zinc-400 line-through' : 'text-red-600'}`}>
                      {mov.valor_egreso > 0 ? formatCurrency(mov.valor_egreso) : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 max-w-[150px] truncate">
                      {mov.estado_o_saldo && <span className={`capitalize font-medium mr-2 ${mov.estado_o_saldo.toLowerCase() === 'anulado' ? 'text-red-500' : 'text-zinc-700'}`}>[{mov.estado_o_saldo}]</span>}
                      <span title={mov.notas || ''}>{mov.notas || ''}</span>
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
            <div className="w-4 h-4 rounded-full border-2 border-zinc-300 border-t-zinc-900 animate-spin" /> Cargando...
          </div>
        ) : movimientos.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-zinc-200 text-center text-zinc-500">Sin movimientos</div>
        ) : (
          movimientos.map((mov) => (
            <div
              key={`${mov.movimiento_id}-${mov.tipo_movimiento}`}
              onClick={() => handleRowClick(mov)}
              className={`bg-white p-4 cursor-pointer hover:bg-zinc-50 transition-colors rounded-xl border border-zinc-200 shadow-sm space-y-3 ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'opacity-60 grayscale' : ''}`}
            >
              <div className="flex justify-between items-start">
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${getTipoBadgeColor(mov.tipo_movimiento)}`}>
                  {getTipoIcon(mov.tipo_movimiento)} {getTipoLabel(mov.tipo_movimiento)}
                </span>
                <span className={`text-xs font-medium px-2 py-1 rounded-md ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'text-red-500 bg-red-50' : 'text-zinc-500 bg-zinc-100'}`}>
                  {mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'Anulado' : new Date(mov.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                </span>
              </div>

              <div>
                <div className={`font-medium ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'line-through text-zinc-500' : 'text-zinc-900'}`}>{mov.concepto}</div>
                {mov.asistente_nombre && (
                  <div className="text-sm">
                    {isAsistenteValidForLink(mov.asistente_id, mov.asistente_nombre) ? (
                      <Link
                        href={`/asistentes/${mov.asistente_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                      >
                        {mov.asistente_nombre}
                      </Link>
                    ) : (
                      <span className="text-zinc-500">{mov.asistente_nombre}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                <div className="flex flex-col gap-1">
                  {mov.metodo_pago && (
                    <span className="capitalize text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-md text-xs border border-zinc-200 w-fit">{mov.metodo_pago.replace('_', ' ')}</span>
                  )}
                </div>

                <div className={`text-right ${mov.estado_o_saldo?.toLowerCase() === 'anulado' ? 'line-through opacity-70' : ''}`}>
                  {mov.valor_deuda > 0 && <div className="font-bold text-blue-600">{formatCurrency(mov.valor_deuda)}</div>}
                  {mov.valor_ingreso > 0 && <div className="font-bold text-emerald-600">+{formatCurrency(mov.valor_ingreso)}</div>}
                  {mov.valor_egreso > 0 && <div className="font-bold text-red-600">-{formatCurrency(mov.valor_egreso)}</div>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Universal Side Panel */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md w-full bg-white/95 backdrop-blur-xl border-l border-zinc-200">
          {selectedMov && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${getTipoBadgeColor(selectedMov.tipo_movimiento)}`}>
                    {getTipoIcon(selectedMov.tipo_movimiento)} {getTipoLabel(selectedMov.tipo_movimiento)}
                  </span>
                  {selectedMov.estado_o_saldo && (
                    <span className={`text-xs font-bold uppercase tracking-wider ${selectedMov.estado_o_saldo.toLowerCase() === 'anulado' ? 'text-red-500' : 'text-zinc-500'}`}>
                      {selectedMov.estado_o_saldo}
                    </span>
                  )}
                </div>
                <SheetTitle className="text-xl">{selectedMov.concepto || 'Movimiento'}</SheetTitle>
                <SheetDescription>
                  Registrado el {new Date(selectedMov.creado_en).toLocaleString('es-CO')}
                </SheetDescription>
              </SheetHeader>

              {/* READ-ONLY MODE OR Cuentas por Cobrar (which we don't edit here directly) */}
              {!isAdmin || !isEditing || selectedMov.tipo_movimiento === 'cuenta_cobrar' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                    <div>
                      <p className="text-xs text-zinc-500 font-medium">Asistente</p>
                      <p className="font-medium text-zinc-900">{selectedMov.asistente_nombre || 'N/A'}</p>
                      {isAsistenteValidForLink(selectedMov.asistente_id, selectedMov.asistente_nombre) && (
                        <Link
                          href={`/asistentes/${selectedMov.asistente_id}`}
                          className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors border border-blue-200"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Ver Perfil Completo
                        </Link>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 font-medium">Fecha de Movimiento</p>
                      <p className="font-medium text-zinc-900">{new Date(selectedMov.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC' })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 font-medium">Valor</p>
                      <p className={`font-bold ${selectedMov.valor_ingreso > 0 ? 'text-emerald-600' : selectedMov.valor_egreso > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                        {formatCurrency(selectedMov.valor_ingreso || selectedMov.valor_egreso || selectedMov.valor_deuda)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 font-medium">Método de Pago</p>
                      <p className="font-medium text-zinc-900 capitalize">{selectedMov.metodo_pago?.replace('_', ' ') || 'N/A'}</p>
                    </div>
                  </div>

                  {selectedMov.notas && (
                    <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200">
                      <p className="text-xs text-yellow-800 font-bold mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Notas / Observaciones</p>
                      <p className="text-sm text-yellow-900">{selectedMov.notas}</p>
                    </div>
                  )}

                  {movimientoBloqueado && (
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                      <p className="text-xs text-amber-800 font-bold mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Edición bloqueada</p>
                      <p className="text-sm text-amber-900">
                        Las aplicaciones de saldo a favor no se editan, anulan ni eliminan desde Historial General para evitar descuadres contables.
                      </p>
                    </div>
                  )}

                  {/* ADMIN ACTION BUTTONS (Only if not already editing) */}
                  {isAdmin && selectedMov.tipo_movimiento !== 'cuenta_cobrar' && !isEditing && (
                    <div className="pt-6 border-t border-zinc-200 flex flex-col gap-3">
                      <button
                        onClick={() => setIsEditing(true)}
                        disabled={movimientoBloqueado}
                        className="w-full flex justify-center items-center gap-2 bg-zinc-900 text-white py-2 rounded-lg font-medium hover:bg-zinc-800 transition-colors"
                      >
                        <Pencil className="w-4 h-4" /> Activar Edición Libre
                      </button>

                      {selectedMov.estado_o_saldo?.toLowerCase() !== 'anulado' && !movimientoBloqueado && (
                        <button
                          onClick={handleAnular}
                          disabled={isAnulando}
                          className="w-full flex justify-center items-center gap-2 bg-red-50 text-red-600 py-2 rounded-lg font-medium hover:bg-red-100 transition-colors border border-red-200"
                        >
                          {isAnulando ? 'Anulando...' : <><Ban className="w-4 h-4" /> Anular Movimiento (Safe)</>}
                        </button>
                      )}

                      <button
                        onClick={handleEliminar}
                        disabled={isDeleting || movimientoBloqueado}
                        className="w-full flex justify-center items-center gap-2 text-red-500 text-sm font-medium hover:underline mt-4"
                      >
                        {isDeleting ? 'Borrando duro...' : <><Trash2 className="w-4 h-4" /> Eliminar Permanentemente (Hard Delete)</>}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* EDIT MODE (Admin Only) */
                <div className="space-y-4">
                  <div className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-between">
                    <span>Modo Edición Activado</span>
                    <button onClick={() => setIsEditing(false)} className="text-zinc-400 hover:text-white">Cancelar</button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Monto (COP)</label>
                      <input
                        type="number"
                        value={editForm.monto}
                        onChange={e => setEditForm({ ...editForm, monto: e.target.value })}
                        className="w-full h-10 rounded-md border border-zinc-300 px-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Fecha</label>
                      <input
                        type="date"
                        value={editForm.fecha}
                        onChange={e => setEditForm({ ...editForm, fecha: e.target.value })}
                        className="w-full h-10 rounded-md border border-zinc-300 px-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    {selectedMov.tipo_movimiento === 'egreso' && (
                      <div>
                        <label className="block text-xs font-medium text-zinc-500 mb-1">Concepto</label>
                        <input
                          type="text"
                          value={editForm.concepto}
                          onChange={e => setEditForm({ ...editForm, concepto: e.target.value })}
                          className="w-full h-10 rounded-md border border-zinc-300 px-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    )}

                    {(selectedMov.tipo_movimiento === 'abono' || selectedMov.tipo_movimiento === 'egreso' || selectedMov.tipo_movimiento === 'anticipo' || selectedMov.tipo_movimiento === 'donacion') && (
                      <div>
                        <label className="block text-xs font-medium text-zinc-500 mb-1">Método de Pago</label>
                        <select
                          value={editForm.metodo_pago}
                          onChange={e => setEditForm({ ...editForm, metodo_pago: e.target.value })}
                          className="w-full h-10 rounded-md border border-zinc-300 px-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="efectivo">Efectivo</option>
                          <option value="nequi">Nequi</option>
                          <option value="daviplata">Daviplata</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                    )}

                    {selectedMov.tipo_movimiento === 'anticipo' && (
                      <div>
                        <label className="block text-xs font-medium text-zinc-500 mb-1">Asistente</label>
                        <select
                          value={editForm.asistente_id}
                          onChange={e => setEditForm({ ...editForm, asistente_id: e.target.value })}
                          className="w-full h-10 rounded-md border border-zinc-300 px-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        >
                          {asistentes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Notas</label>
                      <textarea
                        value={editForm.notas}
                        onChange={e => setEditForm({ ...editForm, notas: e.target.value })}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        rows={3}
                      />
                    </div>

                    <button
                      onClick={handleSaveEdit}
                      disabled={isSaving}
                      className="w-full flex justify-center items-center gap-2 bg-emerald-600 text-white py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors mt-4"
                    >
                      {isSaving ? 'Guardando...' : <><Save className="w-4 h-4" /> Guardar Cambios</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
