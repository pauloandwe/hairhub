import { sendWhatsAppMessage } from '../api/meta.api'
import { ensureUserApiToken } from '../services/auth-token.service'
import { appointmentFunctions } from '../functions/appointments/appointment.functions'
import { appointmentCancellationFunctions } from '../functions/appointments/cancellation/appointment-cancellation.functions'
import { appointmentRescheduleFunctions } from '../functions/appointments/reschedule/appointment-reschedule.functions'
import { registerInteractiveSelectionHandler } from './registry'

export type ClientQuickActionType = 'BOOK_APPOINTMENT' | 'RESCHEDULE_APPOINTMENT' | 'CANCEL_APPOINTMENT'

const PANEL_CLIENT_ACTION_NAMESPACE = 'PANEL_CLIENT_ACTION'

const QUICK_ACTION_LABELS: Record<ClientQuickActionType, string> = {
  BOOK_APPOINTMENT: 'Marcar horario',
  RESCHEDULE_APPOINTMENT: 'Remarcar horario',
  CANCEL_APPOINTMENT: 'Cancelar horario',
}

let isRegistered = false

function normalizeBusinessPhone(value: string): string {
  return String(value || '')
    .replace(/\D/g, '')
    .trim()
}

export function mapClientQuickActionsToButtons(businessPhone: string, quickActions: ClientQuickActionType[]) {
  const sanitizedBusinessPhone = normalizeBusinessPhone(businessPhone)

  return quickActions
    .filter((action, index, array) => action in QUICK_ACTION_LABELS && array.indexOf(action) === index)
    .slice(0, 3)
    .map((action) => ({
      id: `${PANEL_CLIENT_ACTION_NAMESPACE}:${action}|${sanitizedBusinessPhone}`,
      title: QUICK_ACTION_LABELS[action],
    }))
}

function parseActionValue(value: string): { action: ClientQuickActionType | null; businessPhone: string | null } {
  const [rawAction, rawBusinessPhone] = String(value || '').split('|')

  const action = rawAction in QUICK_ACTION_LABELS ? (rawAction as ClientQuickActionType) : null
  const businessPhone = normalizeBusinessPhone(rawBusinessPhone || '')

  return { action, businessPhone: businessPhone || null }
}

export function registerPanelClientQuickActionHandler(): void {
  if (isRegistered) {
    return
  }

  registerInteractiveSelectionHandler(PANEL_CLIENT_ACTION_NAMESPACE, async ({ userId, value }) => {
    const { action, businessPhone } = parseActionValue(value)

    if (!action || !businessPhone) {
      await sendWhatsAppMessage(userId, 'Nao consegui abrir essa acao por aqui. Pode me mandar uma mensagem de novo?')
      return
    }

    try {
      const auth = await ensureUserApiToken(businessPhone, userId)
      if (!auth) {
        await sendWhatsAppMessage(userId, 'Nao consegui identificar sua business agora. Tente novamente em instantes.')
        return
      }

      if (action === 'BOOK_APPOINTMENT') {
        await appointmentFunctions.startAppointmentRegistration({ phone: userId })
        return
      }

      if (action === 'RESCHEDULE_APPOINTMENT') {
        await appointmentRescheduleFunctions.startAppointmentReschedule({ phone: userId })
        return
      }

      if (action === 'CANCEL_APPOINTMENT') {
        await appointmentCancellationFunctions.startAppointmentCancellation({ phone: userId })
        return
      }
    } catch (error) {
      console.error('[PanelClientQuickAction] Failed to open quick action:', {
        action,
        businessPhone,
        userId,
        errorMessage: error instanceof Error ? error.message : String(error),
        error,
      })
      await sendWhatsAppMessage(userId, 'Tive um problema para abrir essa acao agora. Pode tentar de novo?')
    }
  })

  isRegistered = true
}
