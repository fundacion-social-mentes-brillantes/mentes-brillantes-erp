import { SocioForm } from '../../SocioForm'
import { notFound } from 'next/navigation'
import { requireRoles } from '@/lib/utils/authz'

export default async function EditarSocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireRoles(['admin'])
  const { data: socio } = await supabase?.from('socios').select('*').eq('id', id).single() || { data: null }

  if (!socio) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Editar Socio</h1>
        <p className="text-gris">Modifica los datos y el porcentaje de participación del socio.</p>
      </div>
      <SocioForm socio={socio} />
    </div>
  )
}
