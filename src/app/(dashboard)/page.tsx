import { Dashboard } from '@/components/dashboard/Dashboard'
import { requireRoles } from '@/lib/utils/authz'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function HomePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireRoles(['admin', 'caja'])
  const { month } = await searchParams;
  return <Dashboard month={month} />
}
