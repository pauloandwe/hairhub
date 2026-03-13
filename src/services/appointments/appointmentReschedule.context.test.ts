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

test('AppointmentRescheduleContextService normalizes natural-language newDate values before executing the tool', async () => {
  const { AppointmentRescheduleContextService } = await import('./appointmentReschedule.context')
  const { appointmentDateInterpreterService } = await import('./appointment-date-interpreter.service')
  const { setUserContext } = await import('../../env.config')

  const phone = '554433332222'
  const instance = AppointmentRescheduleContextService.getInstance() as any
  const originalInterpreter = appointmentDateInterpreterService.interpretRequestedAppointmentDate.bind(appointmentDateInterpreterService)
  const originalGetFunctionToCall = instance.getFunctionToCall

  let receivedArgs: any = null

  await setUserContext(phone, {
    activeRegistration: {},
    businessTimezone: 'America/Sao_Paulo',
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
        id: 'tool-reschedule-date',
        type: 'function',
        function: {
          name: 'changeAppointmentRescheduleField',
          arguments: JSON.stringify({
            field: 'newDate',
            value: 'segunda',
          }),
        },
      } as any,
      phone,
    )

    assert.equal(JSON.parse(response.content).status, 'success')
    assert.equal(receivedArgs?.value, '2026-03-16')
  } finally {
    appointmentDateInterpreterService.interpretRequestedAppointmentDate = originalInterpreter
    instance.getFunctionToCall = originalGetFunctionToCall
  }
})

test('AppointmentRescheduleContextService stops newDate updates when clarification is still required', async () => {
  const { AppointmentRescheduleContextService } = await import('./appointmentReschedule.context')
  const { appointmentDateInterpreterService } = await import('./appointment-date-interpreter.service')
  const { setUserContext } = await import('../../env.config')

  const phone = '554433332223'
  const instance = AppointmentRescheduleContextService.getInstance() as any
  const originalInterpreter = appointmentDateInterpreterService.interpretRequestedAppointmentDate.bind(appointmentDateInterpreterService)
  const originalGetFunctionToCall = instance.getFunctionToCall

  let called = false

  await setUserContext(phone, {
    activeRegistration: {},
    businessTimezone: 'America/Sao_Paulo',
  } as any)

  appointmentDateInterpreterService.interpretRequestedAppointmentDate = async () => ({
    interpretation: {
      kind: 'needs_clarification',
      matchedText: 'next week maybe',
      locale: 'en-US',
    },
    resolution: {
      normalizedDate: null,
      source: 'ai_interpreter',
      matchedText: 'next week maybe',
      requiresClarification: true,
      clarificationMessage: 'Nao consegui entender qual data voce quer. Me fala a data com mais detalhe, por favor.',
      interpretationKind: 'needs_clarification',
      locale: 'en-US',
    },
  })

  instance.getFunctionToCall = () => async () => {
    called = true
    return { status: 'success' }
  }

  try {
    const response = await instance.executeToolFunction(
      {
        id: 'tool-reschedule-clarify',
        type: 'function',
        function: {
          name: 'changeAppointmentRescheduleField',
          arguments: JSON.stringify({
            field: 'newDate',
            value: 'next week maybe',
          }),
        },
      } as any,
      phone,
    )

    const parsed = JSON.parse(response.content)
    assert.equal(called, false)
    assert.match(String(parsed.error || ''), /Nao consegui entender qual data/)
  } finally {
    appointmentDateInterpreterService.interpretRequestedAppointmentDate = originalInterpreter
    instance.getFunctionToCall = originalGetFunctionToCall
  }
})
