import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeAppointmentToolArguments } from './appointment-tool-args'
import { AppointmentDateInterpreterService } from './appointment-date-interpreter.service'

const FIXED_NOW = new Date('2026-03-12T15:00:00.000Z')
const TIMEZONE = 'America/Sao_Paulo'

function createInterpreterMock(result: { normalizedDate: string | null; requiresClarification: boolean; clarificationMessage?: string }) {
  return {
    interpretRequestedAppointmentDate: async () => ({
      interpretation: {
        kind: result.requiresClarification ? 'needs_clarification' : 'day_only',
        locale: 'pt-BR',
        matchedText: 'dia 16',
      },
      resolution: {
        normalizedDate: result.normalizedDate,
        source: 'ai_interpreter',
        matchedText: 'dia 16',
        requiresClarification: result.requiresClarification,
        clarificationMessage: result.clarificationMessage,
        interpretationKind: result.requiresClarification ? 'needs_clarification' : 'day_only',
        locale: 'pt-BR',
      },
    }),
  } as unknown as AppointmentDateInterpreterService
}

test('normalizeAppointmentToolArguments injects a normalized date for availability queries', async () => {
  const result = await normalizeAppointmentToolArguments({
    functionName: 'getAvailableTimeSlots',
    args: {},
    incomingMessage: 'quero ver os horarios disponiveis dia 16',
    timezone: TIMEZONE,
    now: FIXED_NOW,
    interpreter: createInterpreterMock({
      normalizedDate: '2026-03-16',
      requiresClarification: false,
    }),
  })

  assert.equal(result.args.date, '2026-03-16')
  assert.equal(result.resolution?.normalizedDate, '2026-03-16')
})

test('normalizeAppointmentToolArguments normalizes appointment booking requests to appointmentDate', async () => {
  const result = await normalizeAppointmentToolArguments({
    functionName: 'startAppointmentRegistration',
    args: {
      appointmentTime: '15:00',
    },
    incomingMessage: 'tem horario dia 16 as 15h?',
    timezone: TIMEZONE,
    now: FIXED_NOW,
    interpreter: createInterpreterMock({
      normalizedDate: '2026-03-16',
      requiresClarification: false,
    }),
  })

  assert.equal(result.args.appointmentDate, '2026-03-16')
  assert.equal(result.resolution?.normalizedDate, '2026-03-16')
})

test('normalizeAppointmentToolArguments stops execution when the interpreter requires clarification', async () => {
  const result = await normalizeAppointmentToolArguments({
    functionName: 'startAppointmentRegistration',
    args: {
      date: '31/02',
    },
    incomingMessage: 'agendar 31/02',
    timezone: TIMEZONE,
    now: FIXED_NOW,
    interpreter: createInterpreterMock({
      normalizedDate: null,
      requiresClarification: true,
      clarificationMessage: '31/02 nao parece uma data valida. Me fala outra data, por favor.',
    }),
  })

  assert.equal(result.resolution?.requiresClarification, true)
  assert.equal(result.resolution?.normalizedDate, null)
})

test('normalizeAppointmentToolArguments forwards pending clarification context to the interpreter', async () => {
  let receivedPending: any = null

  const interpreter = {
    interpretRequestedAppointmentDate: async (params: Record<string, unknown>) => {
      receivedPending = params.pendingClarification
      return {
        interpretation: {
          kind: 'day_month',
          day: 16,
          month: 3,
          matchedText: '16 de marco',
          locale: 'pt-BR',
        },
        resolution: {
          normalizedDate: '2026-03-16',
          source: 'ai_interpreter',
          matchedText: '16 de marco',
          requiresClarification: false,
          interpretationKind: 'day_month',
          locale: 'pt-BR',
        },
      }
    },
  } as unknown as AppointmentDateInterpreterService

  const result = await normalizeAppointmentToolArguments({
    functionName: 'getAvailableTimeSlots',
    args: {},
    incomingMessage: 'marco',
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
    interpreter,
  })

  assert.equal(receivedPending?.originalMessage, 'quero ver os horarios dia 16')
  assert.equal(result.args.date, '2026-03-16')
})
