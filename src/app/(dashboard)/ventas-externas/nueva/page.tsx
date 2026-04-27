import { requireRoles } from '@/lib/utils/authz'
import { VentaExternaForm } from '../VentaExternaForm'

export default async function NuevaVentaExternaPage() {
  await requireRoles(['admin', 'caja'])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Nueva venta externa</h1>
        <p className="text-zinc-500 text-sm">Registra un ingreso sin cuenta por cobrar ni asistente asociado.</p>
      </div>
      <VentaExternaForm />
    </div>
  )
}
