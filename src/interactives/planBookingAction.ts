import { sendWhatsAppMessage } from '../api/meta.api'
import { getUserContextSync, setUserContext } from '../env.config'
import { appointmentFunctions } from '../functions/appointments/appointment.functions'
import { ensureUserApiToken } from '../services/auth-token.service'
import { registerInteractiveSelectionHandler } from './registry'
import { buildNamespacedId, registerPendingListInteraction } from '../utils/interactive'

export interface PlanBookingActionPayload {
  planId: number
  businessId: string | number
  businessPhone: string
  serviceId: number
  serviceName: string
  serviceDuration?: number | null
  professionalId: number
  professionalName: string
}

export interface ActivePlanBookingState extends PlanBookingActionPayload {
  active: true
}

const PLAN_BOOKING_NAMESPACE = 'PLAN_BOOKING'
const PLAN_BOOKING_BUTTON_LABEL = 'Escolher horario'

let isRegistered = false

function encodePlanBookingAction(action: PlanBookingActionPayload): string {
  return Buffer.from(JSON.stringify(action)).toString('base64url')
}

function decodePlanBookingAction(value: string): PlanBookingActionPayload | null {
  try {
    const raw = Buffer.from(String(value || ''), 'base64url').toString('utf8')
    const parsed = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Number.isFinite(Number(parsed.planId)) ||
      !Number.isFinite(Number(parsed.serviceId)) ||
      !Number.isFinite(Number(parsed.professionalId)) ||
      !String(parsed.businessPhone || '').trim()
    ) {
      return null
    }

    return {
      planId: Number(parsed.planId),
      businessId: parsed.businessId,
      businessPhone: String(parsed.businessPhone),
      serviceId: Number(parsed.serviceId),
      serviceName: String(parsed.serviceName || '').trim() || 'servico',
      serviceDuration:
        parsed.serviceDuration === null || parsed.serviceDuration === undefined
          ? null
          : Number(parsed.serviceDuration),
      professionalId: Number(parsed.professionalId),
      professionalName: String(parsed.professionalName || '').trim() || 'profissional',
    }
  } catch {
    return null
  }
}

export function buildPlanBookingButton(action: PlanBookingActionPayload): {
  id: string
  title: string
} {
  return {
    id: buildNamespacedId(PLAN_BOOKING_NAMESPACE, encodePlanBookingAction(action)),
    title: PLAN_BOOKING_BUTTON_LABEL,
  }
}

export function registerPendingPlanBookingInteraction(userId: string, action: PlanBookingActionPayload): void {
  registerPendingListInteraction({
    userId,
    type: 'planBookingInteraction',
    namespace: PLAN_BOOKING_NAMESPACE,
    ids: [encodePlanBookingAction(action)],
  })
}

export function getActivePlanBooking(userId: string): ActivePlanBookingState | null {
  const planBooking = getUserContextSync(userId)?.activeRegistration?.planBooking
  if (!planBooking || planBooking.active !== true) {
    return null
  }

  return planBooking as ActivePlanBookingState
}

export function registerPlanBookingActionHandler(): void {
  if (isRegistered) {
    return
  }

  registerInteractiveSelectionHandler(PLAN_BOOKING_NAMESPACE, async ({ userId, value, accepted }) => {
    if (!accepted) {
      await sendWhatsAppMessage(userId, 'Esse botao expirou. Se quiser, eu envio um novo lembrete para voce continuar.')
      return
    }

    const action = decodePlanBookingAction(value)
    if (!action) {
      await sendWhatsAppMessage(userId, 'Nao consegui abrir esse agendamento agora. Pode tentar de novo?')
      return
    }

    try {
      const auth = await ensureUserApiToken(action.businessPhone, userId)
      if (!auth) {
        await sendWhatsAppMessage(userId, 'Nao consegui identificar o estabelecimento agora. Tente novamente em instantes.')
        return
      }

      const currentRegistration = getUserContextSync(userId)?.activeRegistration ?? {}
      await setUserContext(userId, {
        activeRegistration: {
          ...currentRegistration,
          planBooking: {
            active: true,
            ...action,
          },
        },
      })

      const response = await appointmentFunctions.startAppointmentRegistration({
        phone: userId,
        service: {
          id: String(action.serviceId),
          name: action.serviceName,
          duration: action.serviceDuration ?? undefined,
        },
        professional: {
          id: String(action.professionalId),
          name: action.professionalName,
        },
      })

      if (response && typeof response === 'object' && 'error' in response && response.error) {
        await sendWhatsAppMessage(userId, String(response.error))
      }
    } catch (error) {
      console.error('[PlanBookingAction] Failed to open plan booking flow:', {
        userId,
        action,
        errorMessage: error instanceof Error ? error.message : String(error),
        error,
      })
      await sendWhatsAppMessage(userId, 'Tive um problema para abrir esse agendamento agora. Pode tentar de novo?')
    }
  })

  isRegistered = true
}
