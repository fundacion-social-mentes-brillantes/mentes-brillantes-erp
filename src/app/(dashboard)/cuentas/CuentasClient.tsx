'use client'

import { formatearFechaIso } from '@/lib/utils/fechas'
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
  asistente_id: string | null
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
      return 'bg-verde/12 text-verde'
    case 'parcial':
      return 'bg-ambar/12 text-ambar'
    default:
      return 'bg-rojo/12 text-rojo'
  }
}

const cardBase = 'rounded-2xl border border-linea bg-panel'
const cardTitle = 'text-base font-semibold text-tinta'

export function CuentasClient({
  cuentas,
  isAdmin = false,
  busqueda = '',
  total = 0,
  paginaActual = 1,
  totalPaginas = 1,
  porPagina = 100,
}: {
  cuentas: Cuenta[]
  isAdmin?: boolean
  busqueda?: string
  total?: number
  paginaActual?: number
  totalPaginas?: number
  porPagina?: number
}) {
  const [selectedCuenta, setSelectedCuenta] = useState<Cuenta | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const handleRowClick = (cuenta: Cuenta) => {
    setSelectedCuenta(cuenta)
    setIsSheetOpen(true)
  }

  const desde = total === 0 ? 0 : (paginaActual - 1) * porPagina + 1
  const hasta = Math.min(paginaActual * porPagina, total)
  const enlacePagina = (p: number) =>
    `/cuentas?${new URLSearchParams({ ...(busqueda ? { q: busqueda } : {}), pagina: String(p) })}`

  return (
    <>
      {/* Buscador y contador. El buscador es un formulario normal (GET) para que
          filtre en la BASE, no en pantalla: es lo que permite llegar a las
          cuentas viejas, que antes ni siquiera se descargaban. */}
      <div className={`${cardBase} p-4 space-y-3`}>
        <form method="get" action="/cuentas" className="flex flex-col sm:flex-row gap-2">
          <input
            type="search"
            name="q"
            defaultValue={busqueda}
            placeholder="Buscar por persona o concepto…"
            className="h-10 flex-1 rounded-2xl border border-linea bg-panel px-3 text-sm text-tinta transition-colors placeholder:text-gris hover:border-linea-fuerte focus:border-acento"
          />
          <button
            type="submit"
            className="h-10 rounded-xl bg-acento px-4 text-sm font-semibold text-sobre-acento transition-colors hover:bg-acento-fuerte"
          >
            Buscar
          </button>
          {busqueda && (
            <Link
              href="/cuentas"
              className="inline-flex h-10 items-center rounded-2xl border border-linea bg-panel px-4 text-sm font-semibold text-tinta transition-colors hover:border-linea-fuerte hover:bg-suave"
            >
              Limpiar
            </Link>
          )}
        </form>
        <p className="text-sm text-gris">
          {total === 0
            ? busqueda
              ? `Ninguna cuenta coincide con «${busqueda}».`
              : 'No hay cuentas registradas.'
            : <>Mostrando <strong className="text-tinta">{desde}–{hasta}</strong> de{' '}
              <strong className="text-tinta">{total}</strong>
              {busqueda ? <> que coinciden con «{busqueda}»</> : ' cuentas'}.</>}
        </p>
      </div>

      {/* Desktop Table */}
      <div className={`hidden md:block ${cardBase} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-linea">
              <tr>
                <th className="px-5 py-3 min-w-[170px]">Asistente</th>
                <th className="px-5 py-3 min-w-[240px]">Concepto</th>
                <th className="px-5 py-3 min-w-[110px]">Fecha</th>
                <th className="px-5 py-3 text-right min-w-[130px]">Total</th>
                <th className="px-5 py-3 text-right min-w-[150px]">Pendiente</th>
                <th className="px-5 py-3 text-center min-w-[120px]">Estado</th>
                <th className="px-5 py-3 text-right min-w-[150px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {cuentas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gris">
                    No hay cuentas por cobrar registradas.
                  </td>
                </tr>
              ) : (
                cuentas.map((cuenta) => (
                  <tr
                    key={cuenta.id}
                    onClick={() => handleRowClick(cuenta)}
                    className="hover:bg-suave cursor-pointer transition-colors align-top"
                  >
                    <td className="px-5 py-3 font-medium text-tinta break-words">
                      {cuenta.asistente_id && cuenta.asistente_nombre ? (
                        <Link
                          href={`/asistentes/${cuenta.asistente_id}`} prefetch={false}
                          onClick={(e) => e.stopPropagation()}
                          className="text-tinta underline-offset-4 transition-colors hover:text-acento hover:underline"
                        >
                          {cuenta.asistente_nombre}
                        </Link>
                      ) : (
                        <span className="text-gris italic">N/A</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gris max-w-[320px] break-words" title={cuenta.concepto}>
                      {cuenta.concepto}
                    </td>
                    <td className="px-5 py-3 text-gris whitespace-nowrap">
                      {formatearFechaIso(cuenta.fecha_emision)}
                    </td>
                    <td className="px-5 py-3 text-right text-tinta font-medium whitespace-nowrap">
                      {formatCurrency(cuenta.saldos.valor_total)}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium whitespace-nowrap ${cuenta.saldos.monto_pendiente > 0 ? 'text-ambar' : 'text-gris'}`}>
                      {formatCurrency(cuenta.saldos.monto_pendiente)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${estadoBadge(cuenta.estado)}`}>
                        {cuenta.estado.charAt(0).toUpperCase() + cuenta.estado.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {cuenta.estado !== 'pagado' && (
                          <Link
                            href={`/cuentas/${cuenta.id}`} prefetch={false}
                            className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg bg-acento/10 px-3 text-sm font-semibold text-acento transition-colors hover:bg-acento/15"
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
      <div className={`md:hidden ${cardBase} divide-y divide-linea overflow-hidden`}>
        {cuentas.length === 0 ? (
          <div className={`${cardBase} p-8 text-center text-gris`}>
            No hay cuentas por cobrar registradas.
          </div>
        ) : (
          cuentas.map((cuenta) => (
            <div
              key={cuenta.id}
              onClick={() => handleRowClick(cuenta)}
              className="fila-larga cursor-pointer space-y-2 p-4 transition-colors hover:bg-suave"
            >
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  {cuenta.asistente_id && cuenta.asistente_nombre ? (
                    <Link
                      href={`/asistentes/${cuenta.asistente_id}`} prefetch={false}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-tinta underline-offset-4 hover:text-acento hover:underline"
                    >
                      {cuenta.asistente_nombre}
                    </Link>
                  ) : (
                    <span className="font-medium text-gris italic">N/A</span>
                  )}
                  <p className="text-sm text-gris mt-0.5 break-words">{cuenta.concepto}</p>
                </div>
                <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${estadoBadge(cuenta.estado)}`}>
                  {cuenta.estado.charAt(0).toUpperCase() + cuenta.estado.slice(1)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gris">
                  {formatearFechaIso(cuenta.fecha_emision)}
                </span>
                <div className="text-right">
                  <div className="font-medium text-tinta">{formatCurrency(cuenta.saldos.valor_total)}</div>
                  {cuenta.saldos.monto_pendiente > 0 && (
                    <div className="text-xs font-medium text-ambar">Pendiente: {formatCurrency(cuenta.saldos.monto_pendiente)}</div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sheet de detalles */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md w-full bg-panel border-l border-linea">
          {selectedCuenta && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-acento/10 px-2.5 py-0.5 text-xs font-semibold text-acento">
                    <Receipt className="w-3.5 h-3.5" /> Cuenta por Cobrar
                  </span>
                  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${estadoBadge(selectedCuenta.estado)}`}>
                    {selectedCuenta.estado.charAt(0).toUpperCase() + selectedCuenta.estado.slice(1)}
                  </span>
                </div>
                <SheetTitle className="text-xl leading-snug text-tinta">{selectedCuenta.concepto}</SheetTitle>
                <SheetDescription className="text-gris">
                  Emitida el {formatearFechaIso(selectedCuenta.fecha_emision)}
                </SheetDescription>
              </SheetHeader>

              {isAdmin && (
                <div className={`${cardBase} p-4 space-y-3`}>
                  <div className="flex items-center">
                                        <h3 className={cardTitle}>Acciones (Admin)</h3>
                  </div>
                  <Link
                    href={`/cuentas/${selectedCuenta.id}`} prefetch={false}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-linea px-3 py-2 text-sm font-medium text-tinta hover:bg-suave"
                  >
                    Editar cuenta
                  </Link>
                  <div className="pt-1">
                    <DeleteCuentaButton cuentaId={selectedCuenta.id} />
                    <p className="text-xs text-gris mt-1">
                      Solo se puede eliminar si no tiene pagos, aplicaciones de saldo a favor ni sesiones coach registradas.
                    </p>
                  </div>
                </div>
              )}

              {/* Info principal */}
              <div className="grid grid-cols-2 gap-4 rounded-2xl bg-suave p-4">
                <div>
                  <p className="mb-0.5 text-sm text-gris">Asistente</p>
                  {selectedCuenta.asistente_id && selectedCuenta.asistente_nombre ? (
                    <>
                      <p className="font-medium text-tinta">{selectedCuenta.asistente_nombre}</p>
                      <Link
                        href={`/asistentes/${selectedCuenta.asistente_id}`} prefetch={false}
                        className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-medium text-acento hover:text-acento bg-acento/12 hover:bg-acento/20 px-2.5 py-1 rounded-md transition-colors border border-acento/35"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Ver Perfil Completo
                      </Link>
                    </>
                  ) : (
                    <p className="text-gris italic">N/A</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gris">Fecha de Emisión</p>
                  <p className="font-medium text-tinta">
                    {formatearFechaIso(selectedCuenta.fecha_emision)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gris">Total Deuda</p>
                  <p className="font-bold text-tinta text-lg">{formatCurrency(selectedCuenta.saldos.valor_total)}</p>
                </div>
                <div>
                  <p className="text-sm text-gris">Pendiente</p>
                  <p
                    className={`font-bold text-lg ${
                      selectedCuenta.saldos.monto_pendiente > 0 ? 'text-rojo-fuerte' : 'text-verde'
                    }`}
                  >
                    {formatCurrency(selectedCuenta.saldos.monto_pendiente)}
                  </p>
                </div>
                {selectedCuenta.saldos.total_abonado > 0 && (
                  <div className="col-span-2">
                    <p className="text-sm text-gris">Total Abonado</p>
                    <p className="font-medium text-verde">{formatCurrency(selectedCuenta.saldos.total_abonado)}</p>
                  </div>
                )}
              </div>

              {/* Historial de abonos */}
              <div>
                <div className="flex items-center mb-3">
                                    <h3 className="text-sm font-semibold text-tinta flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-ambar" />
                    Abonos Aplicados ({selectedCuenta.abonos.length})
                  </h3>
                </div>
                {selectedCuenta.abonos.length === 0 ? (
                  <div className={`${cardBase} p-4 text-sm text-gris text-center`}>Sin abonos registrados aún.</div>
                ) : (
                  <div className="space-y-2">
                    {selectedCuenta.abonos.map((abono, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl bg-suave px-4 py-2.5"
                      >
                        <div className="text-tinta">
                          <p className="text-xs text-verde font-medium">
                            {formatearFechaIso(abono.fecha_pago)}
                          </p>
                          {abono.metodo_pago && (
                            <p className="text-xs text-gris capitalize">{abono.metodo_pago.replace('_', ' ')}</p>
                          )}
                          {abono.notas && <p className="text-xs text-gris mt-0.5">{abono.notas}</p>}
                        </div>
                        <span className="font-bold text-verde text-sm">+{formatCurrency(Number(abono.monto))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botón ir a la cuenta */}
              {selectedCuenta.estado !== 'pagado' && (
                <div className="pt-4 border-t border-linea">
                  <Link
                    href={`/cuentas/${selectedCuenta.id}`} prefetch={false}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-acento text-sm font-semibold text-sobre-acento transition-colors hover:bg-acento-fuerte"
                  >
                    Registrar Abono
                  </Link>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {totalPaginas > 1 && (
        <div className={`${cardBase} p-4 flex items-center justify-between gap-3`}>
          {paginaActual > 1 ? (
            <Link
              href={enlacePagina(paginaActual - 1)}
              className="inline-flex h-10 items-center rounded-2xl border border-linea bg-panel px-4 text-sm font-semibold text-tinta transition-colors hover:border-linea-fuerte hover:bg-suave"
            >
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-gris">
            Página {paginaActual} de {totalPaginas}
          </span>
          {paginaActual < totalPaginas ? (
            <Link
              href={enlacePagina(paginaActual + 1)}
              className="inline-flex h-10 items-center rounded-2xl border border-linea bg-panel px-4 text-sm font-semibold text-tinta transition-colors hover:border-linea-fuerte hover:bg-suave"
            >
              Siguientes →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  )
}
