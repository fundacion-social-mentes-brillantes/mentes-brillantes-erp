'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Receipt, AlertTriangle } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

type Abono = {
  monto: number
  fecha_pago: string
  metodo_pago: string | null
  notas: string | null
}

type Cuenta = {
  id: string
  concepto: string
  fecha_emision: string
  estado: string
  valor_total: number
  asistente_id: string
  asistente_nombre: string | null
  abonos: Abono[]
  saldos: {
    valor_total: number
    total_abonado: number
    monto_pendiente: number
  }
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount)

const estadoBadge = (estado: string) => {
  switch (estado) {
    case 'pagado':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'parcial':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    default:
      return 'bg-red-100 text-red-700 border-red-200'
  }
}

export function CuentasClient({ cuentas }: { cuentas: Cuenta[] }) {
  const [selectedCuenta, setSelectedCuenta] = useState<Cuenta | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const handleRowClick = (cuenta: Cuenta) => {
    setSelectedCuenta(cuenta)
    setIsSheetOpen(true)
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
              <tr>
                <th className="px-6 py-4">Asistente</th>
                <th className="px-6 py-4">Concepto</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4 text-right">Total</th>
                <th className="px-6 py-4 text-right">Pendiente</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {cuentas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">
                    No hay cuentas por cobrar registradas.
                  </td>
                </tr>
              ) : (
                cuentas.map((cuenta) => (
                  <tr
                    key={cuenta.id}
                    onClick={() => handleRowClick(cuenta)}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-zinc-900">
                      {cuenta.asistente_nombre ? (
                        <Link
                          href={`/asistentes/${cuenta.asistente_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                        >
                          {cuenta.asistente_nombre}
                        </Link>
                      ) : (
                        <span className="text-zinc-400 italic">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-zinc-500 max-w-[240px] truncate" title={cuenta.concepto}>
                      {cuenta.concepto}
                    </td>
                    <td className="px-6 py-4 text-zinc-500">
                      {new Date(cuenta.fecha_emision).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                    </td>
                    <td className="px-6 py-4 text-right text-zinc-900 font-medium">
                      {formatCurrency(cuenta.saldos.valor_total)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-red-600">
                      {formatCurrency(cuenta.saldos.monto_pendiente)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${estadoBadge(cuenta.estado)}`}>
                        {cuenta.estado.charAt(0).toUpperCase() + cuenta.estado.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {cuenta.estado !== 'pagado' && (
                          <Link
                            href={`/cuentas/${cuenta.id}`}
                            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-colors bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 h-8 px-3"
                          >
                            Registrar abono
                          </Link>
                        )}
                      </div>
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
        {cuentas.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-zinc-200 text-center text-zinc-500">
            No hay cuentas por cobrar registradas.
          </div>
        ) : (
          cuentas.map((cuenta) => (
            <div
              key={cuenta.id}
              onClick={() => handleRowClick(cuenta)}
              className="bg-white p-4 cursor-pointer hover:bg-zinc-50 transition-colors rounded-xl border border-zinc-200 shadow-sm space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  {cuenta.asistente_nombre ? (
                    <Link
                      href={`/asistentes/${cuenta.asistente_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {cuenta.asistente_nombre}
                    </Link>
                  ) : (
                    <span className="font-medium text-zinc-400 italic">N/A</span>
                  )}
                  <p className="text-sm text-zinc-500 mt-0.5 truncate">{cuenta.concepto}</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${estadoBadge(cuenta.estado)}`}>
                  {cuenta.estado.charAt(0).toUpperCase() + cuenta.estado.slice(1)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-sm">
                <span className="text-zinc-400">
                  {new Date(cuenta.fecha_emision).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                </span>
                <div className="text-right">
                  <div className="font-medium text-zinc-900">{formatCurrency(cuenta.saldos.valor_total)}</div>
                  {cuenta.saldos.monto_pendiente > 0 && (
                    <div className="text-xs font-medium text-red-600">Pendiente: {formatCurrency(cuenta.saldos.monto_pendiente)}</div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sheet de detalles */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md w-full bg-white/95 backdrop-blur-xl border-l border-zinc-200">
          {selectedCuenta && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
                    <Receipt className="w-3.5 h-3.5" /> Cuenta por Cobrar
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${estadoBadge(selectedCuenta.estado)}`}>
                    {selectedCuenta.estado.charAt(0).toUpperCase() + selectedCuenta.estado.slice(1)}
                  </span>
                </div>
                <SheetTitle className="text-xl leading-snug">{selectedCuenta.concepto}</SheetTitle>
                <SheetDescription>
                  Emitida el {new Date(selectedCuenta.fecha_emision).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                </SheetDescription>
              </SheetHeader>

              {/* Info principal */}
              <div className="grid grid-cols-2 gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                <div>
                  <p className="text-xs text-zinc-500 font-medium mb-1">Asistente</p>
                  {selectedCuenta.asistente_nombre ? (
                    <>
                      <p className="font-medium text-zinc-900">{selectedCuenta.asistente_nombre}</p>
                      <Link
                        href={`/asistentes/${selectedCuenta.asistente_id}`}
                        className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors border border-blue-200"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Ver Perfil Completo
                      </Link>
                    </>
                  ) : (
                    <p className="text-zinc-400 italic">N/A</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-zinc-500 font-medium">Fecha de Emisión</p>
                  <p className="font-medium text-zinc-900">
                    {new Date(selectedCuenta.fecha_emision).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 font-medium">Total Deuda</p>
                  <p className="font-bold text-blue-600 text-lg">{formatCurrency(selectedCuenta.saldos.valor_total)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 font-medium">Pendiente</p>
                  <p className={`font-bold text-lg ${selectedCuenta.saldos.monto_pendiente > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatCurrency(selectedCuenta.saldos.monto_pendiente)}
                  </p>
                </div>
                {selectedCuenta.saldos.total_abonado > 0 && (
                  <div className="col-span-2">
                    <p className="text-xs text-zinc-500 font-medium">Total Abonado</p>
                    <p className="font-medium text-emerald-600">{formatCurrency(selectedCuenta.saldos.total_abonado)}</p>
                  </div>
                )}
              </div>

              {/* Historial de abonos */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Abonos Aplicados ({selectedCuenta.abonos.length})
                </h3>
                {selectedCuenta.abonos.length === 0 ? (
                  <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4 text-sm text-zinc-400 text-center">
                    Sin abonos registrados aún.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedCuenta.abonos.map((abono, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5"
                      >
                        <div>
                          <p className="text-xs text-emerald-700 font-medium">
                          {new Date(abono.fecha_pago).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                        </p>
                          {abono.metodo_pago && (
                            <p className="text-xs text-emerald-600 capitalize">{abono.metodo_pago.replace('_', ' ')}</p>
                          )}
                          {abono.notas && (
                            <p className="text-xs text-zinc-500 mt-0.5">{abono.notas}</p>
                          )}
                        </div>
                        <span className="font-bold text-emerald-700 text-sm">
                          +{formatCurrency(Number(abono.monto))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botón ir a la cuenta */}
              {selectedCuenta.estado !== 'pagado' && (
                <div className="pt-4 border-t border-zinc-200">
                  <Link
                    href={`/cuentas/${selectedCuenta.id}`}
                    className="w-full flex justify-center items-center gap-2 bg-zinc-900 text-white py-2.5 rounded-lg font-medium hover:bg-zinc-800 transition-colors text-sm"
                  >
                    Registrar Abono
                  </Link>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
