import { requireRoles } from '@/lib/utils/authz'
import UsuariosTable from './UsuariosTable'
import { NewUsuarioForm } from './NewUsuarioForm'

export const dynamic = 'force-dynamic'

export default async function UsuariosConfigPage() {
  const { supabase } = await requireRoles(['admin'])

  const { data: perfiles } = await supabase
    .from('perfiles')
    .select('id, nombre, rol, asistente_id, asistentes (nombre)')
    .order('nombre', { ascending: true })

  const { data: asistentes } = await supabase
    .from('asistentes')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  const perfilesNormalizados =
    (perfiles || []).map((p) => ({
      ...p,
      asistentes: Array.isArray(p.asistentes) ? (p.asistentes[0] ?? null) : p.asistentes ?? null,
    }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Usuarios</h1>
        <p className="text-gris text-sm">
          Administra roles y, para rol consulta, asigna el asistente vinculado.
        </p>
      </div>

      <NewUsuarioForm asistentes={asistentes || []} />

      <UsuariosTable perfiles={perfilesNormalizados} asistentes={asistentes || []} />
    </div>
  )
}
