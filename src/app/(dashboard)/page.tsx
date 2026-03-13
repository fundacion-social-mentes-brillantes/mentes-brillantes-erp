import { Dashboard } from '@/components/dashboard/Dashboard'

export default async function HomePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  return <Dashboard month={month} />
}
