import axios from 'axios'
import { whatsappLogger } from '../../utils/pino'
import { env } from '../../env.config'

export interface SendReminderPayload {
  businessPhone: string
  clientPhone: string
  message: string
  appointmentId: number
  type: string
}

export interface ReminderSendResponse {
  success: boolean
  messageId?: string
  appointmentId: number
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

        const messageId = await this.sendMessageViaMetaAPI(clientPhone, message)

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

  private static async sendMessageViaMetaAPI(to: string, text: string): Promise<string> {
    const PHONE_NUMBER_ID = env.PHONE_NUMBER_ID
    const META_ACCESS_TOKEN = env.META_ACCESS_TOKEN
    const WHATSAPP_API_VERSION = env.WHATSAPP_API_VERSION

    if (!PHONE_NUMBER_ID || !META_ACCESS_TOKEN) {
      throw new Error('PHONE_NUMBER_ID e META_ACCESS_TOKEN são obrigatórios')
    }

    try {
      const response = await axios.post(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: {
            body: text,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      )

      return response.data?.messages?.[0]?.id || 'unknown'
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
