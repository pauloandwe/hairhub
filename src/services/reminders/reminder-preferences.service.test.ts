import assert from 'node:assert/strict'
import test from 'node:test'
import axios from 'axios'

function applyRequiredEnv(): void {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key'
  process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'test-meta-verify-token'
  process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'test-meta-access-token'
  process.env.API_URL = process.env.API_URL || 'http://localhost:3000'
  process.env.BACKEND_URL = process.env.BACKEND_URL || 'http://backend.internal:3001'
  process.env.WHATSAPP_WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || 'test-reminder-secret'
  process.env.WHATSAPP_SEND_TIMEOUT_MS = process.env.WHATSAPP_SEND_TIMEOUT_MS || '5000'
  process.env.WHATSAPP_SEND_SAFE_RETRY_ATTEMPTS = process.env.WHATSAPP_SEND_SAFE_RETRY_ATTEMPTS || '1'
}

applyRequiredEnv()

test('ReminderPreferencesService.shouldSendReminder uses the business-scoped backend route with auth headers', async () => {
  const { ReminderPreferencesService } = await import('./reminder-preferences.service')
  const originalGet = axios.get
  const calls: Array<{ url: string; options: any }> = []

  ReminderPreferencesService.clearCache()
  axios.get = (async (url: string, options: any) => {
    calls.push({ url, options })
    return {
      data: {
        remindersEnabled: false,
        optOutDate: '2026-03-13T12:00:00.000Z',
      },
    } as any
  }) as typeof axios.get

  try {
    const result = await ReminderPreferencesService.shouldSendReminder('5511999999999', '554488657557')

    assert.equal(result, false)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'http://backend.internal:3001/client-preferences/business/5511999999999/phone/554488657557')
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-reminder-secret')
    assert.equal(calls[0].options.headers['X-Reminder-Token'], 'Bearer test-reminder-secret')
  } finally {
    axios.get = originalGet
    ReminderPreferencesService.clearCache()
  }
})

test('ReminderPreferencesService opt-out and opt-in send both businessPhone and clientPhone', async () => {
  const { ReminderPreferencesService } = await import('./reminder-preferences.service')
  const originalPut = axios.put
  const calls: Array<{ url: string; body: any; options: any }> = []

  ReminderPreferencesService.clearCache()
  axios.put = (async (url: string, body: any, options: any) => {
    calls.push({ url, body, options })
    return { data: { success: true } } as any
  }) as typeof axios.put

  try {
    await ReminderPreferencesService.optOut('5511999999999', '554488657557')
    await ReminderPreferencesService.optIn('5511999999999', '554488657557')

    assert.equal(calls.length, 2)
    assert.deepEqual(calls[0].body, {
      businessPhone: '5511999999999',
      clientPhone: '554488657557',
    })
    assert.deepEqual(calls[1].body, {
      businessPhone: '5511999999999',
      clientPhone: '554488657557',
    })
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-reminder-secret')
    assert.equal(calls[1].options.headers['X-Reminder-Token'], 'Bearer test-reminder-secret')
  } finally {
    axios.put = originalPut
    ReminderPreferencesService.clearCache()
  }
})
