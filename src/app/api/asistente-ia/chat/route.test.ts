import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireRolesMock = vi.fn()

vi.mock('@/lib/utils/authz', () => ({
  requireRoles: (...args: unknown[]) => requireRolesMock(...args),
  AuthzError: class AuthzError extends Error {},
}))

const { POST } = await import('./route')

// Cliente supabase minimo: insert() sirve tanto para crear la conversacion
// (.insert().select().single()) como para guardar el mensaje (await .insert()).
function makeSupabase() {
  const insertResult: any = {
    select: () => ({ single: () => Promise.resolve({ data: { id: 'conv-1' }, error: null }) }),
    then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
  }
  return {
    from: () => ({
      insert: () => insertResult,
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }),
  }
}

const ENV = ['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'DEEPSEEK_BASE_URL'] as const
const snapshot: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV) snapshot[k] = process.env[k]
  requireRolesMock.mockResolvedValue({ supabase: makeSupabase(), user: { id: 'u1' } })
})

afterEach(() => {
  for (const k of ENV) {
    if (snapshot[k] === undefined) delete process.env[k]
    else process.env[k] = snapshot[k]
  }
  vi.clearAllMocks()
})

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/asistente-ia/chat', { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/asistente-ia/chat', () => {
  it('responde 400 si no hay pregunta', async () => {
    const res = await post({ messages: [] })
    expect(res.status).toBe(400)
  })

  it('responde 500 claro si DeepSeek no esta configurado', async () => {
    delete process.env.DEEPSEEK_API_KEY
    delete process.env.DEEPSEEK_MODEL
    delete process.env.DEEPSEEK_BASE_URL

    const res = await post({ messages: [{ role: 'user', content: 'cuanto debe Ana' }] })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/deepseek no est/i)
  })
})
