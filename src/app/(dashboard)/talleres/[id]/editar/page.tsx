import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/utils/authz'
import { preguntasGuardadas } from '@/lib/operaciones/talleres'
import { TallerForm } from '../../TallerForm'
import { BorrarTaller } from './BorrarTaller'

export default async function EditarTallerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireAdmin()
  const { data: taller } = await supabase.from('talleres').select('*').eq('id', id).maybeSingle()
  if (!taller) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Editar taller</h1>
        <p className="text-sm text-gris">{taller.nombre}</p>
      </div>
      <TallerForm taller={taller} preguntas={preguntasGuardadas(taller.preguntas)} />
      <BorrarTaller tallerId={taller.id} />
    </div>
  )
}
