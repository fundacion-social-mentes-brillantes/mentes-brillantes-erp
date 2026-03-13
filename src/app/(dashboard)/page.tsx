import { Dashboard } from '@/components/dashboard/Dashboard'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function HomePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  return <Dashboard month={month} />
}
