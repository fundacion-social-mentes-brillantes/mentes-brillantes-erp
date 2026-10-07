import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseFalso } from '@/lib/operaciones/__tests__/supabase-falso'

const requireAdminMock = vi.fn()
const createAdminClientMock = vi.fn()

vi.mock('@/lib/utils/authz', () => ({
  AuthzError: class AuthzError extends Error {},
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClientMock() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { actualizarUsuario, crearUsuario } = await import('./actions')

const form = (values: Record<string, string>) => {
  const f = new FormData()
  Object.entries(values).forEach(([k, v]) => f.set(k, v))
  return f
}

const adminAuth = () => {
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: 'nuevo-1' } }, error: null })
  const deleteUser = vi.fn().mockResolvedValue({ error: null })
  return { auth: { admin: { createUser, deleteUser } }, createUser, deleteUser }
}

describe('configuracion/usuarios', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no deja que un admin se quite a si mismo el rol', async () => {
    const supabase = supabaseFalso({ perfiles: [{ id: 'yo', rol: 'admin' }, { id: 'otro', rol: 'admin' }] })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'yo' } })

    const r = await actualizarUsuario(null, form({ id: 'yo', rol: 'caja' }))

    expect(r?.error).toMatch(/a ti mismo/i)
    expect(supabase.tablas.perfiles[0].rol).toBe('admin')
  })

  it('no deja el ERP sin administradores', async () => {
    const supabase = supabaseFalso({ perfiles: [{ id: 'unico', rol: 'admin' }, { id: 'yo', rol: 'caja' }] })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'otro-admin-de-prueba' } })

    const r = await actualizarUsuario(null, form({ id: 'unico', rol: 'consulta', asistente_id: 'a1' }))

    expect(r?.error).toMatch(/al menos un administrador/i)
  })

  it('no vincula dos usuarios a la misma persona', async () => {
    const supabase = supabaseFalso({
      perfiles: [
        { id: 'u1', rol: 'consulta', asistente_id: 'a1' },
        { id: 'u2', rol: 'caja', asistente_id: null },
      ],
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin' } })

    const r = await actualizarUsuario(null, form({ id: 'u2', rol: 'consulta', asistente_id: 'a1' }))

    expect(r?.error).toMatch(/ya está vinculado/i)
  })

  it('rechaza roles inventados', async () => {
    requireAdminMock.mockResolvedValue({ supabase: supabaseFalso({}), user: { id: 'admin' } })

    const r = await actualizarUsuario(null, form({ id: 'u1', rol: 'superadmin' }))

    expect(r?.error).toMatch(/rol no valido/i)
  })

  it('cambia el rol y quita el vinculo si deja de ser consulta', async () => {
    const supabase = supabaseFalso({ perfiles: [{ id: 'u1', rol: 'consulta', asistente_id: 'a1' }] })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin' } })

    const r = await actualizarUsuario(null, form({ id: 'u1', rol: 'caja' }))

    expect(r).toEqual({ success: true })
    expect(supabase.tablas.perfiles[0]).toEqual(expect.objectContaining({ rol: 'caja', asistente_id: null }))
  })

  it('crea el usuario sin poner el rol en user_metadata', async () => {
    const supabase = supabaseFalso({ perfiles: [] })
    const admin = adminAuth()
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin' } })
    createAdminClientMock.mockReturnValue(admin)

    const r = await crearUsuario(null, form({ nombre: 'Caja 2', email: 'Caja2@Ejemplo.org', password: '12345678', rol: 'caja' }))

    expect(r).toEqual({ success: true })
    expect(admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'caja2@ejemplo.org', user_metadata: { nombre: 'Caja 2' } })
    )
    expect(supabase.tablas.perfiles).toEqual([expect.objectContaining({ id: 'nuevo-1', rol: 'caja', asistente_id: null })])
  })

  it('si falla el perfil, borra el usuario recien creado', async () => {
    const supabase = supabaseFalso({ perfiles: [] }, { fallaInsert: ['perfiles'] })
    const admin = adminAuth()
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin' } })
    createAdminClientMock.mockReturnValue(admin)

    const r = await crearUsuario(null, form({ nombre: 'X', email: 'x@y.co', password: '12345678', rol: 'caja' }))

    expect(r?.error).toMatch(/no se creó el usuario/i)
    expect(admin.deleteUser).toHaveBeenCalledWith('nuevo-1')
  })
})
