import { PeriodoForm } from './PeriodoForm'
import { requireRoles } from '@/lib/utils/authz'

export default async function NuevoPeriodoPage() {
  await requireRoles(['admin'])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Nuevo Período</h1>
        <p className="text-zinc-500 text-sm">Abre un nuevo período contable para registrar adelantos y liquidar.</p>
      </div>
      <PeriodoForm />
    </div>
  )
}
