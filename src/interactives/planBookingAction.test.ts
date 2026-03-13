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

test('plan booking action starts the appointment flow with locked service and professional', async () => {
  const planBookingModule = await import('./planBookingAction')
  const registryModule = await import('./registry')
  const authTokenModule = await import('../services/auth-token.service')
  const appointmentFunctionsModule = await import('../functions/appointments/appointment.functions')
  const envModule = await import('../env.config')

  const originalEnsureUserApiToken = authTokenModule.ensureUserApiToken
  const originalStartAppointmentRegistration = appointmentFunctionsModule.appointmentFunctions.startAppointmentRegistration

  const action = {
    planId: 8,
    businessId: 1,
    businessPhone: '5511888888888',
    serviceId: 14,
    serviceName: 'Corte + barba',
    serviceDuration: 60,
    professionalId: 6,
    professionalName: 'Joao',
  }
  const userId = '554488657557'
  let capturedArgs: any = null

  authTokenModule.ensureUserApiToken = (async () => ({ id: '1', token: 'token' })) as unknown as typeof authTokenModule.ensureUserApiToken
  appointmentFunctionsModule.appointmentFunctions.startAppointmentRegistration = (async (args: Record<string, any>) => {
    capturedArgs = args
    return { message: 'ok', interactive: true }
  }) as typeof appointmentFunctionsModule.appointmentFunctions.startAppointmentRegistration

  try {
    planBookingModule.registerPlanBookingActionHandler()

    const button = planBookingModule.buildPlanBookingButton(action)
    planBookingModule.registerPendingPlanBookingInteraction(userId, action)

    const handled = await registryModule.handleIncomingInteractiveList(userId, 'wamid.reply', button.id)

    assert.equal(handled, true)
    assert.ok(capturedArgs)
    assert.equal(capturedArgs.phone, userId)
    assert.deepEqual(capturedArgs.service, {
      id: '14',
      name: 'Corte + barba',
      duration: 60,
    })
    assert.deepEqual(capturedArgs.professional, {
      id: '6',
      name: 'Joao',
    })

    const context = envModule.getUserContextSync(userId)
    assert.equal(context?.activeRegistration?.planBooking?.planId, 8)
    assert.equal(context?.activeRegistration?.planBooking?.serviceId, 14)
    assert.equal(context?.activeRegistration?.planBooking?.professionalId, 6)
  } finally {
    authTokenModule.ensureUserApiToken = originalEnsureUserApiToken
    appointmentFunctionsModule.appointmentFunctions.startAppointmentRegistration = originalStartAppointmentRegistration
  }
})
