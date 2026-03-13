import { createClient } from '@/lib/supabase/server'
import { SocioForm } from '../../SocioForm'
import { notFound } from 'next/navigation'

export default async function EditarSocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: socio } = await supabase?.from('socios').select('*').eq('id', id).single() || { data: null }

  if (!socio) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Editar Socio</h1>
        <p className="text-zinc-500">Modifica los datos y el porcentaje de participación del socio.</p>
      </div>
      <SocioForm socio={socio} />
    </div>
  )
}
