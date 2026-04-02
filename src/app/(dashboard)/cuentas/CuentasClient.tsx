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
import { DeleteCuentaButton } from './[id]/DeleteCuentaButton'

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
      return 'bg-[rgba(var(--success),0.12)] text-[rgb(var(--success))] border-[rgba(var(--success),0.35)]'
    case 'parcial':
      return 'bg-[rgba(234,179,8,0.15)] text-[rgb(202,138,4)] border-[rgba(234,179,8,0.35)]'
    default:
      return 'bg-[rgba(239,68,68,0.14)] text-[rgb(185,28,28)] border-[rgba(239,68,68,0.38)]'
  }
}

const cardBase = 'rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] shadow-sm'
const cardHeader =
  'px-5 py-4 flex items-center justify-between bg-[rgb(var(--surface-2))] border-b border-[rgb(var(--border))]'
const cardTitle = 'text-sm font-semibold tracking-tight text-[rgb(var(--text-primary))]'
const headerAccent = 'inline-block w-1.5 h-6 rounded-full bg-[rgb(var(--accent))] mr-2'

export function CuentasClient({ cuentas, isAdmin = false }: { cuentas: Cuenta[]; isAdmin?: boolean }) {
  const [selectedCuenta, setSelectedCuenta] = useState<Cuenta | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const handleRowClick = (cuenta: Cuenta) => {
    setSelectedCuenta(cuenta)
    setIsSheetOpen(true)
  }

  return (
    <>
      {/* Desktop Table */}
      <div className={`hidden md:block ${cardBase} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[rgb(var(--surface-2))] border-b border-[rgb(var(--border))] text-[rgb(var(--text-muted))] font-medium">
              <tr>
                <th className="px-6 py-4 min-w-[170px]">Asistente</th>
                <th className="px-6 py-4 min-w-[240px]">Concepto</th>
                <th className="px-6 py-4 min-w-[110px]">Fecha</th>
                <th className="px-6 py-4 text-right min-w-[130px]">Total</th>
                <th className="px-6 py-4 text-right min-w-[150px]">Pendiente</th>
                <th className="px-6 py-4 text-center min-w-[120px]">Estado</th>
                <th className="px-6 py-4 text-right min-w-[150px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {cuentas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-[rgb(var(--text-muted))]">
                    No hay cuentas por cobrar registradas.
                  </td>
                </tr>
              ) : (
                cuentas.map((cuenta) => (
                  <tr
                    key={cuenta.id}
                    onClick={() => handleRowClick(cuenta)}
                    className="hover:bg-[rgb(var(--surface-2))] cursor-pointer transition-colors align-top"
                  >
                    <td className="px-6 py-4 font-medium text-[rgb(var(--text-primary))] break-words">
                      {cuenta.asistente_nombre ? (
                        <Link
                          href={`/asistentes/${cuenta.asistente_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[rgb(var(--accent))] hover:underline transition-colors"
                        >
                          {cuenta.asistente_nombre}
                        </Link>
                      ) : (
                        <span className="text-[rgb(var(--text-muted))] italic">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[rgb(var(--text-muted))] max-w-[320px] break-words" title={cuenta.concepto}>
                      {cuenta.concepto}
                    </td>
                    <td className="px-6 py-4 text-[rgb(var(--text-muted))] whitespace-nowrap">
                      {new Date(cuenta.fecha_emision).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                    </td>
                    <td className="px-6 py-4 text-right text-[rgb(var(--text-primary))] font-medium whitespace-nowrap">
                      {formatCurrency(cuenta.saldos.valor_total)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-amber-600 whitespace-nowrap">
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
                            className="inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors h-8 px-3 border border-[rgba(var(--success),0.35)] bg-[rgba(var(--success),0.12)] text-[rgb(var(--success))] hover:bg-[rgba(var(--success),0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent),0.35)]"
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
          <div className={`${cardBase} p-8 text-center text-[rgb(var(--text-muted))]`}>
            No hay cuentas por cobrar registradas.
          </div>
        ) : (
          cuentas.map((cuenta) => (
            <div
              key={cuenta.id}
              onClick={() => handleRowClick(cuenta)}
              className={`${cardBase} p-4 cursor-pointer hover:bg-[rgb(var(--surface-2))] transition-colors space-y-3`}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  {cuenta.asistente_nombre ? (
                    <Link
                      href={`/asistentes/${cuenta.asistente_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-[rgb(var(--accent))] hover:underline"
                    >
                      {cuenta.asistente_nombre}
                    </Link>
                  ) : (
                    <span className="font-medium text-[rgb(var(--text-muted))] italic">N/A</span>
                  )}
                  <p className="text-sm text-[rgb(var(--text-muted))] mt-0.5 break-words">{cuenta.concepto}</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${estadoBadge(cuenta.estado)}`}>
                  {cuenta.estado.charAt(0).toUpperCase() + cuenta.estado.slice(1)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[rgb(var(--border))] text-sm">
                <span className="text-[rgb(var(--text-muted))]">
                  {new Date(cuenta.fecha_emision).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                </span>
                <div className="text-right">
                  <div className="font-medium text-[rgb(var(--text-primary))]">{formatCurrency(cuenta.saldos.valor_total)}</div>
                  {cuenta.saldos.monto_pendiente > 0 && (
                    <div className="text-xs font-medium text-amber-600">Pendiente: {formatCurrency(cuenta.saldos.monto_pendiente)}</div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sheet de detalles */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md w-full bg-[rgb(var(--surface-1))] border-l border-[rgb(var(--border))]">
          {selectedCuenta && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border bg-[rgba(var(--accent),0.12)] text-[rgb(var(--accent))] border-[rgba(var(--accent),0.35)]">
                    <Receipt className="w-3.5 h-3.5" /> Cuenta por Cobrar
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${estadoBadge(selectedCuenta.estado)}`}>
                    {selectedCuenta.estado.charAt(0).toUpperCase() + selectedCuenta.estado.slice(1)}
                  </span>
                </div>
                <SheetTitle className="text-xl leading-snug text-[rgb(var(--text-primary))]">{selectedCuenta.concepto}</SheetTitle>
                <SheetDescription className="text-[rgb(var(--text-muted))]">
                  Emitida el {new Date(selectedCuenta.fecha_emision).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                </SheetDescription>
              </SheetHeader>

              {isAdmin && (
                <div className={`${cardBase} p-4 space-y-3`}>
                  <div className="flex items-center">
                    <span className={headerAccent} />
                    <h3 className={cardTitle}>Acciones (Admin)</h3>
                  </div>
                  <Link
                    href={`/cuentas/${selectedCuenta.id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--surface-2))]"
                  >
                    Editar cuenta
                  </Link>
                  <div className="pt-1">
                    <DeleteCuentaButton cuentaId={selectedCuenta.id} />
                    <p className="text-xs text-[rgb(var(--text-muted))] mt-1">
                      Solo se puede eliminar si no tiene pagos, aplicaciones de saldo a favor ni sesiones coach registradas.
                    </p>
                  </div>
                </div>
              )}

              {/* Info principal */}
              <div className="grid grid-cols-2 gap-4 bg-[rgb(var(--surface-2))] p-4 rounded-xl border border-[rgb(var(--border))]">
                <div>
                  <p className="text-xs text-[rgb(var(--text-muted))] font-medium mb-1">Asistente</p>
                  {selectedCuenta.asistente_nombre ? (
                    <>
                      <p className="font-medium text-[rgb(var(--text-primary))]">{selectedCuenta.asistente_nombre}</p>
                      <Link
                        href={`/asistentes/${selectedCuenta.asistente_id}`}
                        className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-medium text-[rgb(var(--accent))] hover:text-[rgb(var(--accent))] bg-[rgba(var(--accent),0.12)] hover:bg-[rgba(var(--accent),0.2)] px-2.5 py-1 rounded-md transition-colors border border-[rgba(var(--accent),0.35)]"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Ver Perfil Completo
                      </Link>
                    </>
                  ) : (
                    <p className="text-[rgb(var(--text-muted))] italic">N/A</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-[rgb(var(--text-muted))] font-medium">Fecha de Emisión</p>
                  <p className="font-medium text-[rgb(var(--text-primary))]">
                    {new Date(selectedCuenta.fecha_emision).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[rgb(var(--text-muted))] font-medium">Total Deuda</p>
                  <p className="font-bold text-[rgb(var(--text-primary))] text-lg">{formatCurrency(selectedCuenta.saldos.valor_total)}</p>
                </div>
                <div>
                  <p className="text-xs text-[rgb(var(--text-muted))] font-medium">Pendiente</p>
                  <p
                    className={`font-bold text-lg ${
                      selectedCuenta.saldos.monto_pendiente > 0 ? 'text-[rgb(185,28,28)]' : 'text-[rgb(var(--success))]'
                    }`}
                  >
                    {formatCurrency(selectedCuenta.saldos.monto_pendiente)}
                  </p>
                </div>
                {selectedCuenta.saldos.total_abonado > 0 && (
                  <div className="col-span-2">
                    <p className="text-xs text-[rgb(var(--text-muted))] font-medium">Total Abonado</p>
                    <p className="font-medium text-[rgb(var(--success))]">{formatCurrency(selectedCuenta.saldos.total_abonado)}</p>
                  </div>
                )}
              </div>

              {/* Historial de abonos */}
              <div>
                <div className="flex items-center mb-3">
                  <span className={headerAccent} />
                  <h3 className="text-sm font-semibold text-[rgb(var(--text-primary))] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Abonos Aplicados ({selectedCuenta.abonos.length})
                  </h3>
                </div>
                {selectedCuenta.abonos.length === 0 ? (
                  <div className={`${cardBase} p-4 text-sm text-[rgb(var(--text-muted))] text-center`}>Sin abonos registrados aún.</div>
                ) : (
                  <div className="space-y-2">
                    {selectedCuenta.abonos.map((abono, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-[rgba(var(--success),0.12)] border border-[rgba(var(--success),0.35)] rounded-lg px-4 py-2.5"
                      >
                        <div className="text-[rgb(var(--text-primary))]">
                          <p className="text-xs text-[rgb(var(--success))] font-medium">
                            {new Date(abono.fecha_pago).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
                          </p>
                          {abono.metodo_pago && (
                            <p className="text-xs text-[rgb(var(--text-muted))] capitalize">{abono.metodo_pago.replace('_', ' ')}</p>
                          )}
                          {abono.notas && <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5">{abono.notas}</p>}
                        </div>
                        <span className="font-bold text-[rgb(var(--success))] text-sm">+{formatCurrency(Number(abono.monto))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botón ir a la cuenta */}
              {selectedCuenta.estado !== 'pagado' && (
                <div className="pt-4 border-t border-[rgb(var(--border))]">
                  <Link
                    href={`/cuentas/${selectedCuenta.id}`}
                    className="w-full flex justify-center items-center gap-2 bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] py-2.5 rounded-lg font-medium hover:bg-[rgb(var(--accent-strong))] transition-colors text-sm"
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
