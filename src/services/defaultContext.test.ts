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

test('DefaultContextService injects the normalized appointment date before calling a tool', async () => {
  const { DefaultContextService } = await import('./defaultContext')
  const { appointmentDateInterpreterService } = await import('./appointments/appointment-date-interpreter.service')
  const { getUserContextSync, setUserContext } = await import('../env.config')

  const phone = '5544999999999'
  const instance = DefaultContextService.getInstance() as any
  const originalInterpreter = appointmentDateInterpreterService.interpretRequestedAppointmentDate.bind(appointmentDateInterpreterService)
  const originalGetFunctionToCall = instance.getFunctionToCall

  let receivedArgs: any = null

  await setUserContext(phone, {
    activeRegistration: {},
    clientName: 'Paulo',
    businessTimezone: 'America/Sao_Paulo',
    pendingAppointmentDateClarification: null,
  } as any)

  appointmentDateInterpreterService.interpretRequestedAppointmentDate = async () => ({
    interpretation: {
      kind: 'day_only',
      day: 16,
      matchedText: 'dia 16',
      locale: 'pt-BR',
    },
    resolution: {
      normalizedDate: '2026-03-16',
      source: 'ai_interpreter',
      matchedText: 'dia 16',
      requiresClarification: false,
      interpretationKind: 'day_only',
      locale: 'pt-BR',
    },
  })

  instance.getFunctionToCall = () => async (args: Record<string, unknown>) => {
    receivedArgs = args
    return { status: 'success' }
  }

  try {
    const response = await instance.executeToolFunction(
      {
        id: 'tool-1',
        type: 'function',
        function: {
          name: 'getAvailableTimeSlots',
          arguments: '{}',
        },
      } as any,
      phone,
      'quero ver os horarios disponiveis dia 16',
    )

    assert.equal(JSON.parse(response.content).status, 'success')
    assert.equal(receivedArgs?.date, '2026-03-16')
  } finally {
    appointmentDateInterpreterService.interpretRequestedAppointmentDate = originalInterpreter
    instance.getFunctionToCall = originalGetFunctionToCall
  }
})

test('DefaultContextService resolves weekday requests without storing a clarification', async () => {
  const { DefaultContextService } = await import('./defaultContext')
  const { appointmentDateInterpreterService } = await import('./appointments/appointment-date-interpreter.service')
  const { getUserContextSync, setUserContext } = await import('../env.config')

  const phone = '5544999991111'
  const instance = DefaultContextService.getInstance() as any
  const originalInterpreter = appointmentDateInterpreterService.interpretRequestedAppointmentDate.bind(appointmentDateInterpreterService)
  const originalGetFunctionToCall = instance.getFunctionToCall

  let receivedArgs: any = null

  await setUserContext(phone, {
    activeRegistration: {},
    clientName: 'Paulo',
    businessTimezone: 'America/Sao_Paulo',
    pendingAppointmentDateClarification: null,
  } as any)

  appointmentDateInterpreterService.interpretRequestedAppointmentDate = async () => ({
    interpretation: {
      kind: 'relative_weekday',
      weekday: 1,
      matchedText: 'segunda',
      locale: 'pt-BR',
    },
    resolution: {
      normalizedDate: '2026-03-16',
      source: 'ai_interpreter',
      matchedText: 'segunda',
      requiresClarification: false,
      interpretationKind: 'relative_weekday',
      locale: 'pt-BR',
    },
  })

  instance.getFunctionToCall = () => async (args: Record<string, unknown>) => {
    receivedArgs = args
    return { status: 'success' }
  }

  try {
    const response = await instance.executeToolFunction(
      {
        id: 'tool-weekday',
        type: 'function',
        function: {
          name: 'getAvailableTimeSlots',
          arguments: '{}',
        },
      } as any,
      phone,
      'consegue ver segunda pra mim se tem',
    )

    assert.equal(JSON.parse(response.content).status, 'success')
    assert.equal(receivedArgs?.date, '2026-03-16')
    assert.equal(getUserContextSync(phone)?.pendingAppointmentDateClarification, null)
  } finally {
    appointmentDateInterpreterService.interpretRequestedAppointmentDate = originalInterpreter
    instance.getFunctionToCall = originalGetFunctionToCall
  }
})

test('DefaultContextService stores pending date clarification when the tool needs more detail', async () => {
  const { DefaultContextService } = await import('./defaultContext')
  const { appointmentDateInterpreterService } = await import('./appointments/appointment-date-interpreter.service')
  const { getUserContextSync, setUserContext } = await import('../env.config')

  const phone = '5544888888888'
  const instance = DefaultContextService.getInstance() as any
  const originalInterpreter = appointmentDateInterpreterService.interpretRequestedAppointmentDate.bind(appointmentDateInterpreterService)

  await setUserContext(phone, {
    activeRegistration: {},
    clientName: 'Paulo',
    businessTimezone: 'America/Sao_Paulo',
    pendingAppointmentDateClarification: null,
  } as any)

  appointmentDateInterpreterService.interpretRequestedAppointmentDate = async () => ({
    interpretation: {
      kind: 'needs_clarification',
      matchedText: 'marco',
      locale: 'pt-BR',
    },
    resolution: {
      normalizedDate: null,
      source: 'ai_interpreter',
      matchedText: 'marco',
      requiresClarification: true,
      clarificationMessage: 'Me fala o mes dessa data, por favor.',
      interpretationKind: 'needs_clarification',
      locale: 'pt-BR',
    },
  })

  try {
    const response = await instance.executeToolFunction(
      {
        id: 'tool-clarification',
        type: 'function',
        function: {
          name: 'getAvailableTimeSlots',
          arguments: '{}',
        },
      } as any,
      phone,
      'quero ver os horarios disponiveis dia 16',
    )

    assert.equal(JSON.parse(response.content).error, 'Me fala o mes dessa data, por favor.')
    assert.equal(getUserContextSync(phone)?.pendingAppointmentDateClarification?.functionName, 'getAvailableTimeSlots')
    assert.equal(getUserContextSync(phone)?.pendingAppointmentDateClarification?.originalMessage, 'quero ver os horarios disponiveis dia 16')
  } finally {
    appointmentDateInterpreterService.interpretRequestedAppointmentDate = originalInterpreter
  }
})

test('DefaultContextService resetSession resets registration state deterministically while preserving pending appointment intents', async () => {
  const { DefaultContextService } = await import('./defaultContext')
  const { getUserContextSync, setUserContext } = await import('../env.config')
  const { appendIntentHistory, getIntentHistory } = await import('./intent-history.service')

  const phone = '554477770001'
  const instance = DefaultContextService.getInstance() as any

  await setUserContext(phone, {
    activeRegistration: {
      type: 'appointment',
      step: 'creating',
      awaitingInputForField: 'service',
      status: 'collecting',
    },
    serviceId: 'svc-old',
    serviceName: 'Corte',
    professionalId: 'pro-old',
    professionalName: 'João',
    timeSlot: '17:00',
    pendingAppointmentOffer: {
      appointmentDate: '2026-03-13',
      appointmentTime: '17:00',
      service: { id: 'svc-1', name: 'Corte', duration: 30 },
      professional: null,
      createdAt: new Date().toISOString(),
      expiresAt: '2999-01-01T00:00:00.000Z',
    },
    pendingAvailabilityResolution: {
      kind: 'service',
      request: { appointmentDate: '2026-03-13', appointmentTime: '17:00' },
      candidates: [{ id: 'svc-1', name: 'Corte', duration: 30 }],
      prompt: 'Qual serviço?',
      createdAt: new Date().toISOString(),
      expiresAt: '2999-01-01T00:00:00.000Z',
    },
    pendingAppointmentDateClarification: {
      functionName: 'getAvailableTimeSlots',
      argsSnapshot: {},
      originalMessage: 'horários dia 16',
      partialInterpretation: null,
      createdAt: new Date().toISOString(),
      expiresAt: '2999-01-01T00:00:00.000Z',
    },
  } as any)

  await appendIntentHistory(phone, 'default', [{ role: 'user', content: 'oi' } as any])
  await instance.resetSession(phone)

  const context = getUserContextSync(phone)
  const defaultHistory = await getIntentHistory(phone, 'default')

  assert.equal(context?.activeRegistration?.type, undefined)
  assert.equal(context?.activeRegistration?.step, '')
  assert.equal(context?.activeRegistration?.awaitingInputForField, undefined)
  assert.equal(context?.serviceId, null)
  assert.equal(context?.serviceName, null)
  assert.equal(context?.professionalId, null)
  assert.equal(context?.professionalName, null)
  assert.equal(context?.timeSlot, null)

  // Pending states from check-then-offer / date clarification are intentionally preserved until resolved or expired.
  assert.ok(context?.pendingAppointmentOffer)
  assert.ok(context?.pendingAvailabilityResolution)
  assert.ok(context?.pendingAppointmentDateClarification)
  assert.equal(defaultHistory.length, 0)
})
