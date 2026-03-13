import assert from 'node:assert/strict'
import { AddressInfo } from 'node:net'
import test from 'node:test'
import express from 'express'
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

async function createReminderServer() {
  const { reminderRouter } = await import('./reminder-handler.service')
  const app = express()
  app.use(express.json())
  app.use(reminderRouter)

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
  })
  const address = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      }),
  }
}

test('reminder handler skips delivery when the client opted out for that business', async () => {
  const { ReminderPreferencesService } = await import('./reminder-preferences.service')
  const { ReminderSenderService } = await import('./reminder-sender.service')
  const originalShouldSendReminder = ReminderPreferencesService.shouldSendReminder
  const originalSendReminder = ReminderSenderService.sendReminder
  let sendCalled = 0

  ReminderPreferencesService.shouldSendReminder = (async () => false) as typeof ReminderPreferencesService.shouldSendReminder
  ReminderSenderService.sendReminder = (async () => {
    sendCalled += 1
    return {
      success: true,
      appointmentId: 0,
      clientPhone: '554488657557',
      type: 'PLAN_REMINDER',
      timestamp: new Date(),
    }
  }) as typeof ReminderSenderService.sendReminder

  const server = await createReminderServer()

  try {
    const response = await fetch(`${server.baseUrl}/api/reminders/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-reminder-secret',
      },
      body: JSON.stringify({
        businessPhone: '5511999999999',
        clientPhone: '554488657557',
        message: 'Olá',
        type: 'PLAN_REMINDER',
      }),
    })

    assert.equal(response.status, 200)
    assert.equal(sendCalled, 0)

    const body = await response.json()
    assert.equal(body.skipped, true)
    assert.match(body.reason, /não receber lembretes/)
  } finally {
    ReminderPreferencesService.shouldSendReminder = originalShouldSendReminder
    ReminderSenderService.sendReminder = originalSendReminder
    await server.close()
  }
})

test('reminder handler still sends when preference lookup fails', async () => {
  const { ReminderPreferencesService } = await import('./reminder-preferences.service')
  const { ReminderSenderService } = await import('./reminder-sender.service')
  const originalSendReminder = ReminderSenderService.sendReminder
  const originalAxiosGet = axios.get
  let sendCalled = 0

  ReminderPreferencesService.clearCache()
  axios.get = (async () => {
    throw new Error('backend unavailable')
  }) as typeof axios.get
  ReminderSenderService.sendReminder = (async () => {
    sendCalled += 1
    return {
      success: true,
      appointmentId: 0,
      clientPhone: '554488657557',
      type: 'PLAN_REMINDER',
      messageId: 'wamid.123',
      timestamp: new Date(),
    }
  }) as typeof ReminderSenderService.sendReminder

  const server = await createReminderServer()

  try {
    const response = await fetch(`${server.baseUrl}/api/reminders/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-reminder-secret',
      },
      body: JSON.stringify({
        businessPhone: '5511999999999',
        clientPhone: '554488657557',
        message: 'Olá',
        type: 'PLAN_REMINDER',
      }),
    })

    assert.equal(response.status, 200)
    assert.equal(sendCalled, 1)

    const body = await response.json()
    assert.equal(body.success, true)
    assert.equal(body.messageId, 'wamid.123')
  } finally {
    axios.get = originalAxiosGet
    ReminderSenderService.sendReminder = originalSendReminder
    ReminderPreferencesService.clearCache()
    await server.close()
  }
})
