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

function futureIso(minutes = 15): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

function pastIso(minutes = 15): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString()
}

test('AppointmentIntentService consumes accepted pending offer and clears state', async () => {
  const { appointmentIntentService } = await import('./appointment-intent.service')
  const { setUserContext, getUserContextSync } = await import('../../env.config')

  const phone = '5511999999101'
  const service = appointmentIntentService as any
  const originalInterpreter = service.interpretPendingOfferReply.bind(service)

  await setUserContext(phone, {
    activeRegistration: {},
    pendingAppointmentOffer: {
      appointmentDate: '2026-03-13',
      appointmentTime: '17:00',
      service: { id: 'svc-1', name: 'Corte', duration: 30 },
      professional: null,
      createdAt: new Date().toISOString(),
      expiresAt: futureIso(),
    },
  } as any)

  service.interpretPendingOfferReply = async () => ({ action: 'accept' })

  try {
    const result = await appointmentIntentService.consumePendingOfferReply(phone, 'quero sim')

    assert.equal(result.handled, true)
    assert.equal(result.action, 'accept')
    if (result.handled && result.action === 'accept') {
      assert.equal(result.offer.appointmentDate, '2026-03-13')
      assert.equal(result.offer.appointmentTime, '17:00')
      assert.equal(result.offer.service?.id, 'svc-1')
      assert.equal(result.offer.service?.name, 'Corte')
    }

    assert.equal(getUserContextSync(phone)?.pendingAppointmentOffer, null)
  } finally {
    service.interpretPendingOfferReply = originalInterpreter
  }
})

test('AppointmentIntentService keeps pending offer when message needs clarification', async () => {
  const { appointmentIntentService } = await import('./appointment-intent.service')
  const { setUserContext, getUserContextSync } = await import('../../env.config')

  const phone = '5511999999102'
  const service = appointmentIntentService as any
  const originalInterpreter = service.interpretPendingOfferReply.bind(service)

  await setUserContext(phone, {
    activeRegistration: {},
    pendingAppointmentOffer: {
      appointmentDate: '2026-03-13',
      appointmentTime: '17:00',
      service: { id: 'svc-1', name: 'Corte', duration: 30 },
      professional: null,
      createdAt: new Date().toISOString(),
      expiresAt: futureIso(),
    },
  } as any)

  service.interpretPendingOfferReply = async () => ({ action: 'needs_clarification' })

  try {
    const result = await appointmentIntentService.consumePendingOfferReply(phone, 'hmmm')

    assert.equal(result.handled, true)
    assert.equal(result.action, 'needs_clarification')
    assert.equal(typeof (result as { message?: string }).message, 'string')
    assert.ok(getUserContextSync(phone)?.pendingAppointmentOffer)
  } finally {
    service.interpretPendingOfferReply = originalInterpreter
  }
})

test('AppointmentIntentService consumes declined pending offer and clears state', async () => {
  const { appointmentIntentService } = await import('./appointment-intent.service')
  const { setUserContext, getUserContextSync } = await import('../../env.config')

  const phone = '5511999999107'
  const service = appointmentIntentService as any
  const originalInterpreter = service.interpretPendingOfferReply.bind(service)

  await setUserContext(phone, {
    activeRegistration: {},
    pendingAppointmentOffer: {
      appointmentDate: '2026-03-13',
      appointmentTime: '17:00',
      service: { id: 'svc-1', name: 'Corte', duration: 30 },
      professional: null,
      createdAt: new Date().toISOString(),
      expiresAt: futureIso(),
    },
  } as any)

  service.interpretPendingOfferReply = async () => ({ action: 'decline' })

  try {
    const result = await appointmentIntentService.consumePendingOfferReply(phone, 'agora nao')
    assert.deepEqual(result, { handled: true, action: 'decline' })
    assert.equal(getUserContextSync(phone)?.pendingAppointmentOffer, null)
  } finally {
    service.interpretPendingOfferReply = originalInterpreter
  }
})

test('AppointmentIntentService ignores expired pending offer and clears stale state', async () => {
  const { appointmentIntentService } = await import('./appointment-intent.service')
  const { setUserContext, getUserContextSync } = await import('../../env.config')

  const phone = '5511999999103'

  await setUserContext(phone, {
    activeRegistration: {},
    pendingAppointmentOffer: {
      appointmentDate: '2026-03-13',
      appointmentTime: '17:00',
      service: { id: 'svc-1', name: 'Corte', duration: 30 },
      professional: null,
      createdAt: new Date().toISOString(),
      expiresAt: pastIso(),
    },
  } as any)

  const result = await appointmentIntentService.consumePendingOfferReply(phone, 'quero sim')

  assert.deepEqual(result, { handled: false })
  assert.equal(getUserContextSync(phone)?.pendingAppointmentOffer, null)
})

test('AppointmentIntentService resolves pending service disambiguation and clears state after selection', async () => {
  const { appointmentIntentService } = await import('./appointment-intent.service')
  const { setUserContext, getUserContextSync } = await import('../../env.config')

  const phone = '5511999999104'
  const service = appointmentIntentService as any
  const originalInterpreter = service.interpretPendingResolutionReply.bind(service)

  await setUserContext(phone, {
    activeRegistration: {},
    pendingAvailabilityResolution: {
      kind: 'service',
      request: {
        appointmentDate: '2026-03-13',
        appointmentTime: '17:00',
      },
      candidates: [
        { id: 'svc-1', name: 'Corte', description: 'Corte simples', duration: 30 },
        { id: 'svc-2', name: 'Corte + Barba', description: 'Completo', duration: 60 },
      ],
      prompt: 'Qual serviço?',
      createdAt: new Date().toISOString(),
      expiresAt: futureIso(),
    },
  } as any)

  service.interpretPendingResolutionReply = async () => ({ action: 'select_candidate', candidateId: 'svc-2' })

  try {
    const result = await appointmentIntentService.consumePendingResolutionReply(phone, 'corte com barba')

    assert.equal(result.handled, true)
    assert.equal(result.action, 'selected')
    if (result.handled && result.action === 'selected') {
      assert.equal((result.request.service as { id?: string })?.id, 'svc-2')
      assert.equal((result.request.service as { name?: string })?.name, 'Corte + Barba')
      assert.equal((result.request.service as { duration?: number })?.duration, 60)
    }

    assert.equal(getUserContextSync(phone)?.pendingAvailabilityResolution, null)
  } finally {
    service.interpretPendingResolutionReply = originalInterpreter
  }
})

test('AppointmentIntentService consumes declined pending resolution and clears state', async () => {
  const { appointmentIntentService } = await import('./appointment-intent.service')
  const { setUserContext, getUserContextSync } = await import('../../env.config')

  const phone = '5511999999108'
  const service = appointmentIntentService as any
  const originalInterpreter = service.interpretPendingResolutionReply.bind(service)

  await setUserContext(phone, {
    activeRegistration: {},
    pendingAvailabilityResolution: {
      kind: 'service',
      request: {
        appointmentDate: '2026-03-13',
        appointmentTime: '17:00',
      },
      candidates: [{ id: 'svc-1', name: 'Corte' }],
      prompt: 'Qual serviço?',
      createdAt: new Date().toISOString(),
      expiresAt: futureIso(),
    },
  } as any)

  service.interpretPendingResolutionReply = async () => ({ action: 'decline' })

  try {
    const result = await appointmentIntentService.consumePendingResolutionReply(phone, 'deixa pra depois')
    assert.deepEqual(result, { handled: true, action: 'decline' })
    assert.equal(getUserContextSync(phone)?.pendingAvailabilityResolution, null)
  } finally {
    service.interpretPendingResolutionReply = originalInterpreter
  }
})

test('AppointmentIntentService keeps pending resolution when message changes topic', async () => {
  const { appointmentIntentService } = await import('./appointment-intent.service')
  const { setUserContext, getUserContextSync } = await import('../../env.config')

  const phone = '5511999999105'
  const service = appointmentIntentService as any
  const originalInterpreter = service.interpretPendingResolutionReply.bind(service)

  await setUserContext(phone, {
    activeRegistration: {},
    pendingAvailabilityResolution: {
      kind: 'professional',
      request: {
        appointmentDate: '2026-03-13',
        appointmentTime: '17:00',
        service: { id: 'svc-1', name: 'Corte', duration: 30 },
      },
      candidates: [{ id: 'pro-1', name: 'João' }],
      prompt: 'Qual profissional?',
      createdAt: new Date().toISOString(),
      expiresAt: futureIso(),
    },
  } as any)

  service.interpretPendingResolutionReply = async () => ({ action: 'needs_clarification' })

  try {
    const result = await appointmentIntentService.consumePendingResolutionReply(phone, 'qual o endereço?')

    assert.equal(result.handled, true)
    assert.equal(result.action, 'needs_clarification')
    assert.equal(typeof (result as { message?: string }).message, 'string')
    assert.ok(getUserContextSync(phone)?.pendingAvailabilityResolution)
  } finally {
    service.interpretPendingResolutionReply = originalInterpreter
  }
})

test('AppointmentIntentService ignores expired pending resolution and clears stale state', async () => {
  const { appointmentIntentService } = await import('./appointment-intent.service')
  const { setUserContext, getUserContextSync } = await import('../../env.config')

  const phone = '5511999999106'

  await setUserContext(phone, {
    activeRegistration: {},
    pendingAvailabilityResolution: {
      kind: 'service',
      request: {
        appointmentDate: '2026-03-13',
        appointmentTime: '17:00',
      },
      candidates: [{ id: 'svc-1', name: 'Corte' }],
      prompt: 'Qual serviço?',
      createdAt: new Date().toISOString(),
      expiresAt: pastIso(),
    },
  } as any)

  const result = await appointmentIntentService.consumePendingResolutionReply(phone, 'corte')

  assert.deepEqual(result, { handled: false })
  assert.equal(getUserContextSync(phone)?.pendingAvailabilityResolution, null)
})
