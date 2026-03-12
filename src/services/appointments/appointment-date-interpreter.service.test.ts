import assert from 'node:assert/strict'
import test from 'node:test'

import { AppointmentDateInterpreterService } from './appointment-date-interpreter.service'

const FIXED_NOW = new Date('2026-03-12T15:00:00.000Z')
const TIMEZONE = 'America/Sao_Paulo'

function createOpenAIMock(argumentsPayload: Record<string, unknown>) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    type: 'function',
                    function: {
                      name: 'interpret_requested_appointment_date',
                      arguments: JSON.stringify(argumentsPayload),
                    },
                  },
                ],
              },
            },
          ],
        }),
      },
    },
  } as any
}

function createOpenAIMockWithCapture(
  argumentsPayload: Record<string, unknown>,
  onCreate: (params: Record<string, any>) => void,
) {
  return {
    chat: {
      completions: {
        create: async (params: Record<string, any>) => {
          onCreate(params)
          return {
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      type: 'function',
                      function: {
                        name: 'interpret_requested_appointment_date',
                        arguments: JSON.stringify(argumentsPayload),
                      },
                    },
                  ],
                },
              },
            ],
          }
        },
      },
    },
  } as any
}

test('AppointmentDateInterpreterService interprets day-only messages', async () => {
  const service = new AppointmentDateInterpreterService(
    createOpenAIMock({
      kind: 'day_only',
      day: 16,
      matchedText: 'dia 16',
      locale: 'pt-BR',
    }),
  )

  const result = await service.interpretRequestedAppointmentDate({
    messageText: 'quero ver os horarios dia 16',
    locale: 'pt-BR',
    timezone: TIMEZONE,
    now: FIXED_NOW,
  })

  assert.equal(result.interpretation.kind, 'day_only')
  assert.equal(result.interpretation.day, 16)
  assert.equal(result.resolution.normalizedDate, '2026-03-16')
})

test('AppointmentDateInterpreterService interprets day/month messages', async () => {
  const service = new AppointmentDateInterpreterService(
    createOpenAIMock({
      kind: 'day_month',
      day: 16,
      month: 4,
      matchedText: '16/04',
      locale: 'pt-BR',
    }),
  )

  const result = await service.interpretRequestedAppointmentDate({
    messageText: 'tem horario para 16/04?',
    locale: 'pt-BR',
    timezone: TIMEZONE,
    now: FIXED_NOW,
  })

  assert.equal(result.interpretation.kind, 'day_month')
  assert.equal(result.resolution.normalizedDate, '2026-04-16')
})

test('AppointmentDateInterpreterService interprets today messages', async () => {
  const service = new AppointmentDateInterpreterService(
    createOpenAIMock({
      kind: 'relative_today',
      matchedText: 'hoje',
      locale: 'pt-BR',
    }),
  )

  const result = await service.interpretRequestedAppointmentDate({
    messageText: 'quero ver horarios hoje',
    locale: 'pt-BR',
    timezone: TIMEZONE,
    now: FIXED_NOW,
  })

  assert.equal(result.interpretation.kind, 'relative_today')
  assert.equal(result.resolution.normalizedDate, '2026-03-12')
})

test('AppointmentDateInterpreterService returns none when there is no date', async () => {
  const service = new AppointmentDateInterpreterService(
    createOpenAIMock({
      kind: 'none',
      locale: 'pt-BR',
    }),
  )

  const result = await service.interpretRequestedAppointmentDate({
    messageText: 'quero ver horarios disponiveis',
    locale: 'pt-BR',
    timezone: TIMEZONE,
    now: FIXED_NOW,
  })

  assert.equal(result.interpretation.kind, 'none')
  assert.equal(result.resolution.normalizedDate, null)
  assert.equal(result.resolution.requiresClarification, false)
})

test('AppointmentDateInterpreterService falls back to clarification when the model is ambiguous', async () => {
  const service = new AppointmentDateInterpreterService(
    createOpenAIMock({
      kind: 'needs_clarification',
      matchedText: 'sexta',
      locale: 'pt-BR',
    }),
  )

  const result = await service.interpretRequestedAppointmentDate({
    messageText: 'quero ver horario na sexta',
    locale: 'pt-BR',
    timezone: TIMEZONE,
    now: FIXED_NOW,
  })

  assert.equal(result.interpretation.kind, 'needs_clarification')
  assert.equal(result.resolution.requiresClarification, true)
})

test('AppointmentDateInterpreterService sends pending clarification context to the model', async () => {
  let capturedParams: any = null
  const service = new AppointmentDateInterpreterService(
    createOpenAIMockWithCapture(
      {
        kind: 'day_month',
        day: 16,
        month: 3,
        matchedText: '16 de marco',
        locale: 'pt-BR',
      },
      (params) => {
        capturedParams = params
      },
    ),
  )

  const result = await service.interpretRequestedAppointmentDate({
    messageText: 'marco',
    locale: 'pt-BR',
    timezone: TIMEZONE,
    now: FIXED_NOW,
    pendingClarification: {
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
  })

  assert.equal(result.interpretation.kind, 'day_month')
  assert.equal(result.resolution.normalizedDate, '2026-03-16')

  const payload = JSON.parse(String((capturedParams as any)?.messages?.[1]?.content || '{}'))
  assert.equal(payload.pendingClarification.originalMessage, 'quero ver os horarios dia 16')
  assert.equal(payload.pendingClarification.partialInterpretation.day, 16)
  assert.equal(payload.pendingClarification.functionName, 'getAvailableTimeSlots')
})
