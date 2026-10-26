import { PeriodoForm } from './PeriodoForm'
import { requireRoles } from '@/lib/utils/authz'

export default async function NuevoPeriodoPage() {
  await requireRoles(['admin'])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Nuevo Período</h1>
        <p className="text-gris text-sm">Abre un nuevo período contable para registrar adelantos y liquidar.</p>
      </div>
      <PeriodoForm />
    </div>
  )
}
