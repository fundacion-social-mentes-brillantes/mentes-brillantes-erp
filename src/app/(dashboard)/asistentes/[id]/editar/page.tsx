import { AsistenteForm } from '../../AsistenteForm'
import { notFound } from 'next/navigation'
import { requireRoles } from '@/lib/utils/authz'

export default async function EditarAsistentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, perfil } = await requireRoles(['admin', 'caja'])
  const { data: asistente } = await supabase?.from('asistentes').select('*').eq('id', id).single() || { data: null }

  if (!asistente) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Editar Asistente</h1>
        <p className="text-gris">Modifica los datos del asistente.</p>
      </div>
      <AsistenteForm asistente={asistente} readOnlyDates={perfil.rol === 'caja'} />
    </div>
  )
}
