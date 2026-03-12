import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeAppointmentDateInterpretation } from './appointment-date-resolution'

const FIXED_NOW = new Date('2026-03-12T15:00:00.000Z')
const TIMEZONE = 'America/Sao_Paulo'

test('normalizeAppointmentDateInterpretation resolves future day-only references', () => {
  const result = normalizeAppointmentDateInterpretation({
    interpretation: {
      kind: 'day_only',
      day: 16,
      matchedText: 'dia 16',
      locale: 'pt-BR',
    },
    timezone: TIMEZONE,
    now: FIXED_NOW,
    source: 'test',
  })

  assert.equal(result.requiresClarification, false)
  assert.equal(result.normalizedDate, '2026-03-16')
})

test('normalizeAppointmentDateInterpretation rolls day-only references to the next valid month', () => {
  const result = normalizeAppointmentDateInterpretation({
    interpretation: {
      kind: 'day_only',
      day: 10,
      matchedText: 'dia 10',
      locale: 'pt-BR',
    },
    timezone: TIMEZONE,
    now: FIXED_NOW,
    source: 'test',
  })

  assert.equal(result.requiresClarification, false)
  assert.equal(result.normalizedDate, '2026-04-10')
})

test('normalizeAppointmentDateInterpretation resolves day/month references to the next future occurrence', () => {
  const result = normalizeAppointmentDateInterpretation({
    interpretation: {
      kind: 'day_month',
      day: 16,
      month: 4,
      matchedText: '16/04',
      locale: 'pt-BR',
    },
    timezone: TIMEZONE,
    now: FIXED_NOW,
    source: 'test',
  })

  assert.equal(result.requiresClarification, false)
  assert.equal(result.normalizedDate, '2026-04-16')
})

test('normalizeAppointmentDateInterpretation rejects invalid calendar dates', () => {
  const result = normalizeAppointmentDateInterpretation({
    interpretation: {
      kind: 'explicit_date',
      day: 31,
      month: 2,
      year: 2026,
      matchedText: '31/02/2026',
      locale: 'pt-BR',
    },
    timezone: TIMEZONE,
    now: FIXED_NOW,
    source: 'test',
  })

  assert.equal(result.requiresClarification, true)
  assert.equal(result.normalizedDate, null)
  assert.match(result.clarificationMessage || '', /31\/02\/2026/)
})

test('normalizeAppointmentDateInterpretation understands relative today and tomorrow', () => {
  const today = normalizeAppointmentDateInterpretation({
    interpretation: {
      kind: 'relative_today',
      matchedText: 'hoje',
      locale: 'pt-BR',
    },
    timezone: TIMEZONE,
    now: FIXED_NOW,
    source: 'test',
  })
  const tomorrow = normalizeAppointmentDateInterpretation({
    interpretation: {
      kind: 'relative_tomorrow',
      matchedText: 'amanha',
      locale: 'pt-BR',
    },
    timezone: TIMEZONE,
    now: FIXED_NOW,
    source: 'test',
  })

  assert.equal(today.normalizedDate, '2026-03-12')
  assert.equal(tomorrow.normalizedDate, '2026-03-13')
})

test('normalizeAppointmentDateInterpretation preserves explicit dates', () => {
  const result = normalizeAppointmentDateInterpretation({
    interpretation: {
      kind: 'explicit_date',
      day: 20,
      month: 5,
      year: 2026,
      matchedText: '2026-05-20',
      locale: 'pt-BR',
    },
    timezone: TIMEZONE,
    now: FIXED_NOW,
    source: 'test',
  })

  assert.equal(result.requiresClarification, false)
  assert.equal(result.normalizedDate, '2026-05-20')
})
