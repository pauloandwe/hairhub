import assert from 'node:assert/strict'
import test from 'node:test'

function applyRequiredEnv(): void {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key'
  process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'test-meta-verify-token'
  process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'test-meta-access-token'
  process.env.API_URL = process.env.API_URL || 'http://localhost:3000'
  process.env.BACKEND_URL = process.env.BACKEND_URL || 'http://backend.internal:3001'
  process.env.WHATSAPP_WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || 'test-reminder-secret'
}

applyRequiredEnv()

test('plan reminders with plan booking action send an interactive button instead of a plain message event', async () => {
  const reminderSenderModule = await import('./reminder-sender.service')
  const metaApiModule = await import('../../api/meta.api')
  const conversationEventsModule = await import('../conversations/conversation-events.client')

  const originalSendWhatsAppInteractiveButtons = metaApiModule.sendWhatsAppInteractiveButtons
  const originalSendWhatsAppMessage = metaApiModule.sendWhatsAppMessage
  const originalEmitOutboundMessage = conversationEventsModule.ConversationEventsClient.emitOutboundMessage

  let interactivePayload: any = null
  let plainMessageCalls = 0
  let emitOutboundCalls = 0

  metaApiModule.sendWhatsAppInteractiveButtons = (async (payload: Record<string, any>) => {
    interactivePayload = payload
    return 'wamid.plan'
  }) as typeof metaApiModule.sendWhatsAppInteractiveButtons
  metaApiModule.sendWhatsAppMessage = (async () => {
    plainMessageCalls += 1
    return 'wamid.text'
  }) as typeof metaApiModule.sendWhatsAppMessage
  conversationEventsModule.ConversationEventsClient.emitOutboundMessage = (async () => {
    emitOutboundCalls += 1
  }) as typeof conversationEventsModule.ConversationEventsClient.emitOutboundMessage

  try {
    const result = await reminderSenderModule.ReminderSenderService.sendReminder({
      businessPhone: '5511888888888',
      clientPhone: '554488657557',
      message: 'Olá Paulo! Está na hora de agendar.',
      appointmentId: 0,
      type: 'PLAN_REMINDER',
      businessId: 1,
      planBookingAction: {
        planId: 8,
        businessId: 1,
        businessPhone: '5511888888888',
        serviceId: 14,
        serviceName: 'Corte + barba',
        serviceDuration: 60,
        professionalId: 6,
        professionalName: 'Joao',
      },
    })

    assert.equal(result.success, true)
    assert.equal(result.messageId, 'wamid.plan')
    assert.equal(plainMessageCalls, 0)
    assert.equal(emitOutboundCalls, 0)
    assert.ok(interactivePayload)
    assert.equal(interactivePayload.to, '554488657557')
    assert.equal(interactivePayload.buttons[0].title, 'Escolher horario')
    assert.equal(interactivePayload.options.metadata.planBookingAction.planId, 8)
  } finally {
    metaApiModule.sendWhatsAppInteractiveButtons = originalSendWhatsAppInteractiveButtons
    metaApiModule.sendWhatsAppMessage = originalSendWhatsAppMessage
    conversationEventsModule.ConversationEventsClient.emitOutboundMessage = originalEmitOutboundMessage
  }
})
