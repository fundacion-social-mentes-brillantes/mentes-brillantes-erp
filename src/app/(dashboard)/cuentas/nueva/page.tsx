import { createClient } from '@/lib/supabase/server'
import { CuentaForm } from './CuentaForm'

type SearchParams = { asistente?: string | string[] }

export default async function NuevaCuentaPage({ searchParams }: { searchParams?: SearchParams | Promise<SearchParams> }) {
  const resolvedParams = typeof (searchParams as any)?.then === 'function'
    ? await (searchParams as Promise<SearchParams>)
    : (searchParams as SearchParams) || {}

  const asistenteInicial = Array.isArray(resolvedParams.asistente)
    ? resolvedParams.asistente[0]
    : resolvedParams.asistente || undefined

  const supabase = await createClient()
  const { data: asistentes } = await supabase?.from('asistentes').select('id, nombre, codigo').eq('activo', true).order('nombre') || { data: [] }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Nueva Cuenta por Cobrar</h1>
        <p className="text-zinc-500 text-sm">Registra una nueva deuda para un asistente.</p>
      </div>
      <CuentaForm asistentes={asistentes || []} asistenteInicial={asistenteInicial} />
    </div>
  )
}
