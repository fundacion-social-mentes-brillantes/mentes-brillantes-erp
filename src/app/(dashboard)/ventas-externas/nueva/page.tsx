import { requireRoles } from '@/lib/utils/authz'
import { VentaExternaForm } from '../VentaExternaForm'

export default async function NuevaVentaExternaPage() {
  await requireRoles(['admin', 'caja'])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Nueva venta externa</h1>
        <p className="text-gris text-sm">Registra un ingreso sin cuenta por cobrar ni asistente asociado.</p>
      </div>
      <VentaExternaForm />
    </div>
  )
}
