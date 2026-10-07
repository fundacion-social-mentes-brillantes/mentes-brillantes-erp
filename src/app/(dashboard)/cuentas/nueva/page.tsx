import { CuentaForm } from './CuentaForm'
import { requireRoles } from '@/lib/utils/authz'
import { rutaInternaSegura } from '@/lib/utils/rutas'

type SearchParams = { asistente?: string | string[]; returnTo?: string | string[] }

export default async function NuevaCuentaPage({ searchParams }: { searchParams?: SearchParams | Promise<SearchParams> }) {
  const resolvedParams = typeof (searchParams as any)?.then === 'function'
    ? await (searchParams as Promise<SearchParams>)
    : (searchParams as SearchParams) || {}

  const asistenteInicial = Array.isArray(resolvedParams.asistente)
    ? resolvedParams.asistente[0]
    : resolvedParams.asistente || undefined

  // Solo rutas del propio ERP: un ?returnTo=//otro-sitio llevaria a la persona afuera.
  const returnTo =
    rutaInternaSegura(Array.isArray(resolvedParams.returnTo) ? resolvedParams.returnTo[0] : resolvedParams.returnTo) ??
    undefined

  const { supabase } = await requireRoles(['admin', 'caja'])
  const { data: asistentes } = await supabase
    ?.from('asistentes')
    .select('id, nombre, codigo')
    .eq('activo', true)
    .order('nombre') || { data: [] }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Nueva Cuenta por Cobrar</h1>
        <p className="text-zinc-500 text-sm">Registra una nueva deuda para un asistente.</p>
      </div>
      <CuentaForm asistentes={asistentes || []} asistenteInicial={asistenteInicial} returnTo={returnTo} />
    </div>
  )
}
