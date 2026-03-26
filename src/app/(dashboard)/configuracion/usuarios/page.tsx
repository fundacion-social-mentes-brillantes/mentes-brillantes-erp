import { requireRoles } from '@/lib/utils/authz'
import { actualizarUsuario } from './actions'

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--text-primary))]">Usuarios</h1>
        <p className="text-[rgb(var(--text-muted))] text-sm">
          Administra roles y, para rol consulta, asigna el asistente vinculado.
        </p>
      </div>

      <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] shadow-soft overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-3 text-sm font-medium text-[rgb(var(--text-muted))] border-b border-[rgb(var(--border))]">
          <span className="col-span-4">Nombre</span>
          <span className="col-span-3">Rol</span>
          <span className="col-span-4">Asistente vinculado (solo consulta)</span>
          <span className="col-span-1 text-right">Guardar</span>
        </div>
        <div className="divide-y divide-[rgb(var(--border))]">
          {(perfiles || []).map((perfil) => (
            <form
              key={perfil.id}
              action={actualizarUsuario}
              className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm"
            >
              <input type="hidden" name="id" value={perfil.id} />
              <span className="col-span-4 text-[rgb(var(--text-primary))] font-medium">{perfil.nombre}</span>
              <select
                name="rol"
                defaultValue={perfil.rol}
                className="col-span-3 h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2 text-[rgb(var(--text-primary))]"
              >
                <option value="admin">admin</option>
                <option value="caja">caja</option>
                <option value="consulta">consulta</option>
              </select>
              <select
                name="asistente_id"
                defaultValue={perfil.asistente_id || ''}
                className="col-span-4 h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2 text-[rgb(var(--text-primary))]"
              >
                <option value="">-- Sin asignar --</option>
                {(asistentes || []).map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              <div className="col-span-1 text-right">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1 text-xs font-medium text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--surface-3))]"
                >
                  Guardar
                </button>
              </div>
            </form>
          ))}
        </div>
      </div>
    </div>
  )
}
