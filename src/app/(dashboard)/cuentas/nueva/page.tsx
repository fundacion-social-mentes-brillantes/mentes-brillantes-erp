import { createClient } from '@/lib/supabase/server'
import { CuentaForm } from './CuentaForm'

export default async function NuevaCuentaPage({ searchParams }: { searchParams?: { asistente?: string } }) {
  const supabase = await createClient()
  const { data: asistentes } = await supabase?.from('asistentes').select('id, nombre, codigo').eq('activo', true).order('nombre') || { data: [] }
  const asistenteInicial = searchParams?.asistente

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
