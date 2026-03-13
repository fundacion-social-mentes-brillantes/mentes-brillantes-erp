import { createClient } from '@/lib/supabase/server'
import { AsistenteForm } from '../../AsistenteForm'
import { notFound } from 'next/navigation'

export default async function EditarAsistentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: asistente } = await supabase?.from('asistentes').select('*').eq('id', id).single() || { data: null }

  if (!asistente) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Editar Asistente</h1>
        <p className="text-zinc-500">Modifica los datos del asistente.</p>
      </div>
      <AsistenteForm asistente={asistente} />
    </div>
  )
}
