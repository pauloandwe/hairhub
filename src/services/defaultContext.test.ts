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

  const phone = '5544999999999'
  const instance = DefaultContextService.getInstance() as any
  const originalInterpreter = appointmentDateInterpreterService.interpretRequestedAppointmentDate.bind(appointmentDateInterpreterService)
  const originalGetFunctionToCall = instance.getFunctionToCall

  let receivedArgs: any = null

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
