import { EgresoForm } from '../EgresoForm'
import { requireRoles } from '@/lib/utils/authz'

export default async function NuevoEgresoPage() {
  await requireRoles(['admin'])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Nuevo Egreso</h1>
        <p className="text-zinc-500 text-sm">Registra un gasto operativo o administrativo.</p>
      </div>
      <EgresoForm />
    </div>
  )
}
