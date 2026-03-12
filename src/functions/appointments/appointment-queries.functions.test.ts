import assert from 'node:assert/strict'
import test from 'node:test'

function applyRequiredEnv(): void {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key'
  process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'test-meta-verify-token'
  process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'test-meta-access-token'
  process.env.API_URL = process.env.API_URL || 'http://localhost:3000'
}

applyRequiredEnv()

test('getAvailableTimeSlots exposes 30-minute display slots while preserving raw aggregated slots', async () => {
  const { appointmentQueryFunctions } = await import('./appointment-queries.functions')
  const { professionalService } = await import('../../services/appointments/professional.service')

  const originalMethod = professionalService.getAvailableSlotsAggregatedDetailed.bind(professionalService)

  professionalService.getAvailableSlotsAggregatedDetailed = async () => ({
    rawSlots: [
      {
        start: '09:00',
        professionals: [{ id: '7', name: 'João' }],
      },
      {
        start: '09:05',
        professionals: [{ id: '7', name: 'João' }],
      },
      {
        start: '09:30',
        professionals: [{ id: '7', name: 'João' }],
      },
    ],
    displaySlots: [
      {
        start: '09:00',
        professionals: [{ id: '7', name: 'João' }],
      },
      {
        start: '09:30',
        professionals: [{ id: '7', name: 'João' }],
      },
    ],
    displayIntervalMinutes: 30,
  })

  try {
    const result = await appointmentQueryFunctions.getAvailableTimeSlots({
      phone: '5544999999999',
      date: '2026-03-16',
    })

    assert.equal(result.status, 'success')
    assert.equal(result.data.display_interval_minutes, 30)
    assert.equal(result.data.availability_precision, 'suggestive_without_service')
    assert.deepEqual(
      result.data.available_slots.map((slot: { time: string }) => slot.time),
      ['09:00', '09:30'],
    )
    assert.deepEqual(
      result.data.available_slots_display.map((slot: { time: string }) => slot.time),
      ['09:00', '09:30'],
    )
    assert.deepEqual(
      result.data.available_slots_raw.map((slot: { time: string }) => slot.time),
      ['09:00', '09:05', '09:30'],
    )
  } finally {
    professionalService.getAvailableSlotsAggregatedDetailed = originalMethod
  }
})

test('getAvailableTimeSlots exposes 30-minute display slots for a single professional', async () => {
  const { appointmentQueryFunctions } = await import('./appointment-queries.functions')
  const { professionalService } = await import('../../services/appointments/professional.service')

  const originalMethod = professionalService.getAvailableSlotsDetailed.bind(professionalService)

  professionalService.getAvailableSlotsDetailed = async () => ({
    rawSlots: ['13:00', '13:05', '13:30'],
    displaySlots: ['13:00', '13:30'],
    displayIntervalMinutes: 30,
  })

  try {
    const result = await appointmentQueryFunctions.getAvailableTimeSlots({
      phone: '5544999999999',
      date: '2026-03-16',
      professionalId: 7,
    })

    assert.equal(result.status, 'success')
    assert.deepEqual(
      result.data.available_slots.map((slot: { time: string; professionalId: number }) => ({
        time: slot.time,
        professionalId: slot.professionalId,
      })),
      [
        { time: '13:00', professionalId: 7 },
        { time: '13:30', professionalId: 7 },
      ],
    )
    assert.deepEqual(
      result.data.available_slots_raw.map((slot: { time: string }) => slot.time),
      ['13:00', '13:05', '13:30'],
    )
  } finally {
    professionalService.getAvailableSlotsDetailed = originalMethod
  }
})
