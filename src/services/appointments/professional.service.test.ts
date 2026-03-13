import assert from 'node:assert/strict'
import test from 'node:test'

function applyRequiredEnv(): void {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key'
  process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'test-meta-verify-token'
  process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'test-meta-access-token'
  process.env.API_URL = process.env.API_URL || 'http://localhost:3000'
  process.env.APPOINTMENTS_URL = process.env.APPOINTMENTS_URL || 'http://backend:3001'
  process.env.REDIS_HOST = ''
  process.env.REDIS_PORT = ''
  process.env.REDIS_PASSWORD = ''
}

applyRequiredEnv()

test('ProfessionalService.getAvailableDays retries once on retryable transport failures without forcing a slot step', async () => {
  const apiModule = await import('../../config/api.config')
  const { ApiError } = await import('../../errors/api-error')
  const { setUserContext } = await import('../../env.config')
  const { professionalService } = await import('./professional.service')

  const originalGet = apiModule.default.get.bind(apiModule.default)
  const phone = '5544999999999'

  await setUserContext(phone, {
    businessId: '3',
    businessPhone: '554431011048',
    activeRegistration: {},
  } as any)

  let attempts = 0

  apiModule.default.get = (async (url: string, options?: { params?: Record<string, unknown> }) => {
    attempts += 1

    assert.equal(options?.params?.stepMinutes, undefined)

    if (attempts === 1) {
      throw new ApiError({
        message: 'socket hang up',
        userMessage: 'Ocorreu um erro ao processar sua solicitação.',
        raw: {
          code: 'ECONNRESET',
          config: {
            method: 'get',
            url,
            params: options?.params,
          },
        },
      })
    }

    return {
      data: {
        data: {
          professionalId: 6,
          professionalName: 'Ricardo',
          availableDays: [
            {
              date: '2026-03-16',
              displayDate: 'Seg, 16/03',
              slotsCount: 4,
            },
          ],
        },
      },
    }
  }) as typeof apiModule.default.get

  try {
    const days = await professionalService.getAvailableDays({
      phone,
      professionalId: 6,
      serviceId: 16,
    })

    assert.equal(attempts, 2)
    assert.deepEqual(days, [
      {
        id: '2026-03-16',
        name: 'Seg, 16/03',
        description: '4 horários disponíveis',
      },
    ])
  } finally {
    apiModule.default.get = originalGet as typeof apiModule.default.get
  }
})
