import { Dashboard } from '@/components/dashboard/Dashboard'
import { getCurrentProfile, requireRoles } from '@/lib/utils/authz'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function HomePage({ searchParams }: { searchParams: Promise<{ periodo?: string; month?: string }> }) {
  const { perfil } = await getCurrentProfile().catch(() => {
    redirect('/login')
  })

  if (perfil.rol === 'consulta') {
    redirect('/mi-estado')
  }

  await requireRoles(['admin', 'caja'])
  const { periodo } = await searchParams;
  return <Dashboard periodo={periodo} />
}
