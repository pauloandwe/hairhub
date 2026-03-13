import axios from 'axios'
import { whatsappLogger } from '../../utils/pino'
import { env } from '../../env.config'
import { ConversationEventsClient } from '../conversations/conversation-events.client'
import { sendWhatsAppInteractiveButtons, sendWhatsAppMessage } from '../../api/meta.api'
import { buildPlanBookingButton, PlanBookingActionPayload, registerPendingPlanBookingInteraction } from '../../interactives/planBookingAction'

export interface SendReminderPayload {
  businessPhone: string
  clientPhone: string
  message: string
  appointmentId?: number
  type: string
  businessId?: string | number
  source?: 'REMINDER' | 'OUTREACH' | 'HUMAN_PANEL' | 'BOT' | 'SYSTEM'
  metadata?: Record<string, any>
  planBookingAction?: PlanBookingActionPayload
}

export interface ReminderSendResponse {
  success: boolean
  messageId?: string
  appointmentId?: number
  clientPhone: string
  type: string
  error?: string
  timestamp: Date
}

const MAX_RETRIES = 3
const RETRY_DELAY = 2000

export class ReminderSenderService {
  static async sendReminder(payload: SendReminderPayload): Promise<ReminderSendResponse> {
    const { businessPhone, clientPhone, message, appointmentId, type } = payload
    let lastError: any

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        whatsappLogger.info(
          {
            appointmentId,
            clientPhone,
            type,
            attempt,
            maxRetries: MAX_RETRIES,
          },
          `Tentando enviar lembrete (${type}) - Tentativa ${attempt}/${MAX_RETRIES}`,
        )

        const messageId = await this.sendMessageViaMetaAPI(payload)

        const emittedByInteractiveButton = type === 'PLAN_REMINDER' && Boolean(payload.planBookingAction)

        if (!emittedByInteractiveButton) {
          try {
            await ConversationEventsClient.emitOutboundMessage({
              clientPhone,
              text: message,
              source: payload.source || this.mapTypeToSource(type),
              businessId: payload.businessId,
              businessPhone,
              providerMessageId: messageId,
              providerStatus: 'SENT',
              metadata: {
                appointmentId,
                reminderType: type,
                ...(payload.metadata || {}),
              },
            })
          } catch (emitError: any) {
            whatsappLogger.warn(
              {
                appointmentId,
                clientPhone,
                type,
                messageId,
                error: emitError?.message,
              },
              'Falha ao emitir evento outbound de conversa para lembrete/outreach',
            )
          }
        }

        whatsappLogger.info(
          {
            appointmentId,
            clientPhone,
            type,
            messageId,
          },
          'Lembrete enviado com sucesso',
        )

        return {
          success: true,
          messageId,
          appointmentId,
          clientPhone,
          type,
          timestamp: new Date(),
        }
      } catch (error: any) {
        lastError = error
        whatsappLogger.warn(
          {
            appointmentId,
            clientPhone,
            type,
            attempt,
            error: error?.message,
            responseStatus: error?.response?.status,
            responseData: error?.response?.data,
          },
          `Falha ao enviar lembrete - Tentativa ${attempt}/${MAX_RETRIES}`,
        )

        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY * Math.pow(2, attempt - 1)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    whatsappLogger.error(
      {
        appointmentId,
        clientPhone,
        type,
        maxRetries: MAX_RETRIES,
        finalError: lastError?.message,
        responseStatus: lastError?.response?.status,
        responseData: lastError?.response?.data,
      },
      'Falha final ao enviar lembrete após todas as tentativas',
    )

    return {
      success: false,
      appointmentId,
      clientPhone,
      type,
      error: lastError?.message || 'Falha desconhecida ao enviar lembrete',
      timestamp: new Date(),
    }
  }

  private static mapTypeToSource(type: string): 'REMINDER' | 'OUTREACH' | 'BOT' {
    const normalized = String(type || '').toLowerCase()
    if (normalized.startsWith('outreach')) return 'OUTREACH'
    if (normalized.includes('reminder')) return 'REMINDER'
    return 'BOT'
  }

  private static async sendMessageViaMetaAPI(payload: SendReminderPayload): Promise<string> {
    const { clientPhone, message, businessPhone, type, businessId, source, metadata, planBookingAction } = payload

    if (type === 'PLAN_REMINDER' && planBookingAction) {
      const button = buildPlanBookingButton(planBookingAction)
      registerPendingPlanBookingInteraction(clientPhone, planBookingAction)

      return sendWhatsAppInteractiveButtons({
        to: clientPhone,
        body: message,
        buttons: [button],
        options: {
          businessPhone,
          businessId,
          source: source || this.mapTypeToSource(type),
          metadata: {
            reminderType: type,
            planBookingAction,
            ...(metadata || {}),
          },
        },
      })
    }

    try {
      return await sendWhatsAppMessage(clientPhone, message, {
        businessPhone,
        source: 'REMINDER',
        suppressConversationEvent: true,
      })
    } catch (error: any) {
      throw new Error(`Falha ao enviar mensagem WhatsApp: ${error?.response?.data?.error?.message || error.message}`)
    }
  }

  static async updateReminderStatusInBackend(logId: number, status: string, messageId?: string, error?: string): Promise<void> {
    const backendUrl = env.BACKEND_URL || 'http://localhost:3001'

    try {
      await axios.put(
        `${backendUrl}/reminders/logs/${logId}/status`,
        {
          status,
          messageId,
          error,
        },
        {
          timeout: 5000,
        },
      )
    } catch (error: any) {
      whatsappLogger.warn(
        {
          logId,
          status,
          error: error?.message,
        },
        'Falha ao atualizar status do lembrete no backend',
      )
    }
  }
}
