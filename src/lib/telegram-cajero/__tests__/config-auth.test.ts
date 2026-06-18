import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getConfig, isAuthorized } from '../handler'

const ENV_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_ALLOWED_CHAT_ID',
  'TELEGRAM_ALLOWED_USER_IDS',
]

const snapshot: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) snapshot[key] = process.env[key]
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key]
    else process.env[key] = snapshot[key]
  }
})

describe('getConfig', () => {
  it('devuelve null si falta el token o el secreto del webhook', () => {
    process.env.TELEGRAM_BOT_TOKEN = ''
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secreto'
    expect(getConfig()).toBeNull()

    process.env.TELEGRAM_BOT_TOKEN = 'token'
    process.env.TELEGRAM_WEBHOOK_SECRET = ''
    expect(getConfig()).toBeNull()
  })

  it('opera con token + secreto aunque la allowlist este vacia (bot recuperable, no mudo)', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token'
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secreto'
    process.env.TELEGRAM_ALLOWED_CHAT_ID = ''
    process.env.TELEGRAM_ALLOWED_USER_IDS = ''

    const config = getConfig()
    expect(config).not.toBeNull()
    expect(config?.allowedChatId).toBeUndefined()
    expect(config?.allowedUserIds.size).toBe(0)
  })
})

describe('isAuthorized', () => {
  const cfg = (chatId: string | undefined, users: string[]) =>
    ({
      botToken: 'token',
      webhookSecret: 'secreto',
      allowedChatId: chatId,
      allowedUserIds: new Set(users),
      deepseek: {},
    }) as any

  const msg = (chatId: number, userId?: number) =>
    ({ chat: { id: chatId }, from: userId ? { id: userId } : undefined }) as any

  it('deniega cuando la allowlist esta vacia (seguro por defecto)', () => {
    expect(isAuthorized(msg(1, 1), cfg(undefined, []))).toBe(false)
    expect(isAuthorized(msg(1, 1), cfg('1', []))).toBe(false)
  })

  it('deniega si el chat o el usuario no coinciden con la allowlist', () => {
    expect(isAuthorized(msg(999, 1), cfg('1', ['1']))).toBe(false)
    expect(isAuthorized(msg(1, 999), cfg('1', ['1']))).toBe(false)
    expect(isAuthorized(msg(1, undefined), cfg('1', ['1']))).toBe(false)
  })

  it('autoriza solo cuando chat y usuario estan en la allowlist', () => {
    expect(isAuthorized(msg(1, 1), cfg('1', ['1', '2']))).toBe(true)
  })
})
