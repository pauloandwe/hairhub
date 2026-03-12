import assert from 'node:assert/strict'
import test from 'node:test'

function applyRequiredEnv(): void {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key'
  process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'test-meta-verify-token'
  process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'test-meta-access-token'
  process.env.API_URL = process.env.API_URL || 'http://localhost:3000'
  process.env.REDIS_HOST = ''
  process.env.REDIS_PORT = ''
  process.env.REDIS_PASSWORD = ''
}

applyRequiredEnv()

test('ContextService consumes pending appointment date clarification replies before the default flow', async () => {
  const { ContextService } = await import('./contextService')
  const { setUserContext } = await import('../../env.config')

  const userId = '5544777777777'
  const instance = ContextService.getInstance() as any
  const originalResume = instance.defaultContext.resumePendingAppointmentDateClarification.bind(instance.defaultContext)
  let receivedMessage: string | null = null

  await setUserContext(userId, {
    activeRegistration: {},
    pendingAppointmentDateClarification: {
      functionName: 'getAvailableTimeSlots',
      argsSnapshot: {},
      originalMessage: 'quero ver os horarios dia 16',
      partialInterpretation: {
        kind: 'day_only',
        day: 16,
        matchedText: 'dia 16',
        locale: 'pt-BR',
      },
      createdAt: '2026-03-12T15:00:00.000Z',
      expiresAt: '2999-03-12T15:15:00.000Z',
    },
  } as any)

  instance.defaultContext.resumePendingAppointmentDateClarification = async (_userId: string, incomingMessage: string) => {
    receivedMessage = incomingMessage
    return true
  }

  try {
    const handled = await instance.handlePendingAppointmentDateClarification(userId, 'marco')

    assert.equal(handled, true)
    assert.equal(receivedMessage, 'marco')
  } finally {
    instance.defaultContext.resumePendingAppointmentDateClarification = originalResume
  }
})

test('ContextService clears expired pending appointment date clarification state', async () => {
  const { ContextService } = await import('./contextService')
  const { getUserContextSync, setUserContext } = await import('../../env.config')

  const userId = '5544666666666'
  const instance = ContextService.getInstance() as any

  await setUserContext(userId, {
    activeRegistration: {},
    pendingAppointmentDateClarification: {
      functionName: 'getAvailableTimeSlots',
      argsSnapshot: {},
      originalMessage: 'quero ver os horarios dia 16',
      partialInterpretation: {
        kind: 'day_only',
        day: 16,
        matchedText: 'dia 16',
        locale: 'pt-BR',
      },
      createdAt: '2026-03-12T15:00:00.000Z',
      expiresAt: '2026-03-12T15:15:00.000Z',
    },
  } as any)

  const handled = await instance.handlePendingAppointmentDateClarification(userId, 'marco')

  assert.equal(handled, false)
  assert.equal(getUserContextSync(userId)?.pendingAppointmentDateClarification, null)
})
