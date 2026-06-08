'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Wallet, X } from 'lucide-react'
import type { MetodoPago, MovimientoResumenDetalle, ResumenMetodo } from '@/lib/utils/liquidaciones'

type ColumnaDetalle = 'ingresos' | 'egresos' | 'adelantos' | 'saldo'

type ResumenPorCuentaInteractivoProps = {
  periodo: {
    nombre: string
    estado: string
    fecha_inicio: string
    fecha_fin: string
  }
  resumenPorCuenta: ResumenMetodo[]
  resumenTotales: {
    total_ingresos: number
    total_salidas: number
    saldo_neto_periodo: number
  }
  adelantosPeriodo: number
  detalles: MovimientoResumenDetalle[]
}

type SeleccionDetalle = {
  metodo: MetodoPago
  columna: ColumnaDetalle
  totalResumen: number
}

const metodoLabels: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  otro: 'Otro',
}

const columnaLabels: Record<ColumnaDetalle, string> = {
  ingresos: 'ingresos',
  egresos: 'egresos operativos',
  adelantos: 'adelantos no operativos',
  saldo: 'saldo neto operativo',
}

const tipoLabels: Record<MovimientoResumenDetalle['tipo'], string> = {
  abono: 'Abono',
  saldo_favor: 'Saldo a favor',
  donacion: 'Donacion',
  venta_externa: 'Venta externa',
  egreso: 'Egreso',
  adelanto: 'Adelanto',
}

const currency = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const formatMoney = (value: number, opts: { negative?: boolean; signed?: boolean } = {}) => {
  const abs = Math.abs(value)
  const prefix = opts.negative || (opts.signed && value < 0) ? '-' : ''
  return `${prefix}${currency.format(abs)}`
}

const signedMonto = (movimiento: MovimientoResumenDetalle, columna: ColumnaDetalle) => {
  if (columna === 'egresos' || columna === 'adelantos') return -movimiento.monto
  if (columna === 'saldo' && movimiento.categoria === 'egreso') return -movimiento.monto
  return movimiento.monto
}

const detalleTotal = (detalles: MovimientoResumenDetalle[], columna: ColumnaDetalle) =>
  detalles.reduce((acc, movimiento) => acc + signedMonto(movimiento, columna), 0)

const comparableTotal = (value: number, columna: ColumnaDetalle) =>
  columna === 'egresos' || columna === 'adelantos' ? Math.abs(value) : value

function filtrarDetalles(detalles: MovimientoResumenDetalle[], metodo: MetodoPago, columna: ColumnaDetalle) {
  return detalles.filter((movimiento) => {
    if (movimiento.metodo_pago !== metodo) return false
    if (columna === 'ingresos') return movimiento.categoria === 'ingreso'
    if (columna === 'egresos') return movimiento.categoria === 'egreso'
    if (columna === 'adelantos') return movimiento.categoria === 'adelanto'
    return movimiento.categoria === 'ingreso' || movimiento.categoria === 'egreso'
  })
}

function ValorResumenButton({
  value,
  label,
  negative,
  signed,
  onClick,
  className,
}: {
  value: number
  label: string
  negative?: boolean
  signed?: boolean
  onClick: () => void
  className: string
}) {
  if (Math.abs(value) < 0.01) {
    return <span>{formatMoney(value, { negative, signed })}</span>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-end gap-1 rounded-md px-2 py-1 text-right font-medium transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${className}`}
      title={label}
    >
      <Search className="h-3.5 w-3.5 opacity-70" />
      {formatMoney(value, { negative, signed })}
    </button>
  )
}

export function ResumenPorCuentaInteractivo({
  periodo,
  resumenPorCuenta,
  resumenTotales,
  adelantosPeriodo,
  detalles,
}: ResumenPorCuentaInteractivoProps) {
  const [seleccion, setSeleccion] = useState<SeleccionDetalle | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSeleccion(null)
    }
    if (seleccion) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [seleccion])

  const detallesSeleccionados = useMemo(
    () => (seleccion ? filtrarDetalles(detalles, seleccion.metodo, seleccion.columna) : []),
    [detalles, seleccion]
  )
  const totalDetalle = seleccion ? detalleTotal(detallesSeleccionados, seleccion.columna) : 0
  const totalDetalleComparable = seleccion ? comparableTotal(totalDetalle, seleccion.columna) : 0
  const totalResumenComparable = seleccion ? comparableTotal(seleccion.totalResumen, seleccion.columna) : 0
  const hayDiferencia = seleccion ? Math.abs(totalDetalleComparable - totalResumenComparable) > 0.01 : false

  const openDetalle = (metodo: MetodoPago, columna: ColumnaDetalle, totalResumen: number) => {
    setSeleccion({ metodo, columna, totalResumen })
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-zinc-400" />
          <h3 className="font-semibold text-zinc-900">Resumen por cuenta</h3>
        </div>
        <span className="text-xs text-zinc-500">
          {periodo.estado === 'abierto' ? 'Proyeccion en vivo' : 'Datos congelados'}
        </span>
      </div>
      <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50/60 text-xs text-zinc-500">
        Total salidas y saldo neto del periodo usan solo egresos operativos. Los adelantos se muestran aparte y no reducen la utilidad.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-zinc-500 font-medium border-b border-zinc-200 bg-zinc-50">
            <tr>
              <th className="px-4 py-3">Metodo</th>
              <th className="px-4 py-3 text-right">Ingresos</th>
              <th className="px-4 py-3 text-right">Egresos operativos</th>
              <th className="px-4 py-3 text-right">Adelantos no operativos</th>
              <th className="px-4 py-3 text-right">Saldo neto operativo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {resumenPorCuenta.map((row) => (
              <tr key={row.metodo_pago}>
                <td className="px-4 py-3 font-medium text-zinc-900">{metodoLabels[row.metodo_pago]}</td>
                <td className="px-4 py-3 text-right text-emerald-700">
                  <ValorResumenButton
                    value={row.total_ingresos}
                    label={`Detalle de ingresos - ${metodoLabels[row.metodo_pago]}`}
                    onClick={() => openDetalle(row.metodo_pago, 'ingresos', row.total_ingresos)}
                    className="text-emerald-700"
                  />
                </td>
                <td className="px-4 py-3 text-right text-red-600">
                  <ValorResumenButton
                    value={row.total_salidas}
                    negative
                    label={`Detalle de egresos operativos - ${metodoLabels[row.metodo_pago]}`}
                    onClick={() => openDetalle(row.metodo_pago, 'egresos', row.total_salidas)}
                    className="text-red-600"
                  />
                </td>
                <td className="px-4 py-3 text-right text-amber-600">
                  <ValorResumenButton
                    value={Number(row.salidas_adelantos ?? 0)}
                    negative
                    label={`Detalle de adelantos no operativos - ${metodoLabels[row.metodo_pago]}`}
                    onClick={() => openDetalle(row.metodo_pago, 'adelantos', Number(row.salidas_adelantos ?? 0))}
                    className="text-amber-600"
                  />
                </td>
                <td className={`px-4 py-3 text-right font-semibold ${row.saldo_neto_periodo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  <ValorResumenButton
                    value={row.saldo_neto_periodo}
                    signed
                    label={`Detalle de saldo neto operativo - ${metodoLabels[row.metodo_pago]}`}
                    onClick={() => openDetalle(row.metodo_pago, 'saldo', row.saldo_neto_periodo)}
                    className={row.saldo_neto_periodo >= 0 ? 'text-emerald-700' : 'text-red-600'}
                  />
                </td>
              </tr>
            ))}
            <tr className="bg-zinc-50 font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right text-emerald-700">{formatMoney(resumenTotales.total_ingresos)}</td>
              <td className="px-4 py-3 text-right text-red-600">{formatMoney(resumenTotales.total_salidas, { negative: true })}</td>
              <td className="px-4 py-3 text-right text-amber-600">{formatMoney(adelantosPeriodo, { negative: true })}</td>
              <td className="px-4 py-3 text-right">{formatMoney(resumenTotales.saldo_neto_periodo, { signed: true })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {seleccion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="absolute inset-0" onClick={() => setSeleccion(null)} aria-label="Cerrar detalle" />
          <div className="relative flex max-h-[86vh] w-full max-w-5xl flex-col rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[rgb(var(--border))] p-4">
              <div>
                <h3 className="font-semibold text-[rgb(var(--text-primary))]">
                  Detalle de {columnaLabels[seleccion.columna]} - {metodoLabels[seleccion.metodo]}
                </h3>
                <p className="mt-1 text-sm text-[rgb(var(--text-muted))]">
                  {periodo.nombre}: {periodo.fecha_inicio} a {periodo.fecha_fin} | Total resumen: {formatMoney(seleccion.totalResumen, {
                    negative: seleccion.columna === 'egresos' || seleccion.columna === 'adelantos',
                    signed: seleccion.columna === 'saldo',
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSeleccion(null)}
                className="text-[rgb(var(--text-muted))] transition-colors hover:text-[rgb(var(--text-primary))]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {hayDiferencia && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                El detalle reconstruido no coincide con el total del resumen. Revisar filtros o movimientos anulados.
              </div>
            )}

            <div className="overflow-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Persona</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Concepto / notas</th>
                    <th className="px-4 py-3">Metodo</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {detallesSeleccionados.map((movimiento) => {
                    const valor = signedMonto(movimiento, seleccion.columna)
                    return (
                      <tr key={movimiento.id}>
                        <td className="px-4 py-3 text-zinc-500">{movimiento.fecha || 'Sin fecha'}</td>
                        <td className="px-4 py-3 font-medium text-zinc-900">{movimiento.persona}</td>
                        <td className="px-4 py-3 text-zinc-600">{tipoLabels[movimiento.tipo]}</td>
                        <td className="px-4 py-3 text-zinc-600">{movimiento.concepto}</td>
                        <td className="px-4 py-3 text-zinc-600">{metodoLabels[movimiento.metodo_pago]}</td>
                        <td className={`px-4 py-3 text-right font-medium ${valor >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {formatMoney(valor, { signed: true })}
                        </td>
                      </tr>
                    )
                  })}
                  {!detallesSeleccionados.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                        Sin movimientos para este filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end border-t border-[rgb(var(--border))] bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900">
              Total detalle: {formatMoney(totalDetalle, {
                negative: seleccion.columna === 'egresos' || seleccion.columna === 'adelantos',
                signed: seleccion.columna === 'saldo',
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
