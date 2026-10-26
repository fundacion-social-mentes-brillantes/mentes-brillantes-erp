import { EgresoForm } from '../../EgresoForm'
import { notFound } from 'next/navigation'
import { requireRoles } from '@/lib/utils/authz'

export default async function EditarEgresoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireRoles(['admin'])
  const { data: egreso } = await supabase?.from('egresos').select('*').eq('id', id).single() || { data: null }

  if (!egreso) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Editar Egreso</h1>
        <p className="text-gris text-sm">Modifica los datos del gasto.</p>
      </div>
      <EgresoForm egreso={egreso} />
    </div>
  )
}
