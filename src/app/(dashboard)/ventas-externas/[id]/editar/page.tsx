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
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Editar venta externa</h1>
        <p className="text-zinc-500 text-sm">Modifica los datos del ingreso externo.</p>
      </div>
      <VentaExternaForm venta={venta} />
    </div>
  )
}
