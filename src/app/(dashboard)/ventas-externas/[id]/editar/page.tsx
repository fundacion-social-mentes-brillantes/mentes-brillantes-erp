import { notFound } from 'next/navigation'
import { requireRoles } from '@/lib/utils/authz'
import { VentaExternaForm } from '../../VentaExternaForm'

export default async function EditarVentaExternaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireRoles(['admin'])
  const { data: venta } = (await supabase?.from('ventas_externas').select('*').eq('id', id).single()) || { data: null }

  if (!venta) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Editar venta externa</h1>
        <p className="text-gris text-sm">Modifica los datos del ingreso externo.</p>
      </div>
      <VentaExternaForm venta={venta} />
    </div>
  )
}
