import axios from 'axios'
import { env } from '../../env.config'
import { whatsappLogger } from '../../utils/pino'

export interface RuntimeAiModeResult {
  businessId: number | null
  clientContactId: number | null
  conversationId: number | null
  aiChatMode: 'AUTO' | 'MANUAL'
  shouldBlockBotReply: boolean
  aiPauseReason: string | null
  aiPausedAt: string | null
  aiPausedUntil: string | null
}

const DEFAULT_RESULT: RuntimeAiModeResult = {
  businessId: null,
  clientContactId: null,
  conversationId: null,
  aiChatMode: 'AUTO',
  shouldBlockBotReply: false,
  aiPauseReason: null,
  aiPausedAt: null,
  aiPausedUntil: null,
}

export class ConversationRuntimeClient {
  static async getAiMode(params: {
    clientPhone: string
    businessPhone?: string
    businessId?: string | number
  }): Promise<RuntimeAiModeResult> {
    if (!params.clientPhone?.trim()) {
      return DEFAULT_RESULT
    }

    try {
      const response = await axios.get(`${env.BACKEND_URL}/client-conversations/internal/ai-mode`, {
        params: {
          clientPhone: params.clientPhone,
          businessPhone: params.businessPhone,
          businessId: params.businessId,
        },
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_WEBHOOK_SECRET}`,
          'X-Reminder-Token': `Bearer ${env.WHATSAPP_WEBHOOK_SECRET}`,
        },
        timeout: 3000,
      })

      const data = (response.data?.data ?? response.data) as Partial<RuntimeAiModeResult> | undefined
      if (!data) {
        return DEFAULT_RESULT
      }

      return {
        businessId: typeof data.businessId === 'number' ? data.businessId : null,
        clientContactId: typeof data.clientContactId === 'number' ? data.clientContactId : null,
        conversationId: typeof data.conversationId === 'number' ? data.conversationId : null,
        aiChatMode: data.aiChatMode === 'MANUAL' ? 'MANUAL' : 'AUTO',
        shouldBlockBotReply: Boolean(data.shouldBlockBotReply),
        aiPauseReason: typeof data.aiPauseReason === 'string' ? data.aiPauseReason : null,
        aiPausedAt: typeof data.aiPausedAt === 'string' ? data.aiPausedAt : null,
        aiPausedUntil: typeof data.aiPausedUntil === 'string' ? data.aiPausedUntil : null,
      }
    } catch (error: any) {
      whatsappLogger.warn(
        {
          clientPhone: params.clientPhone,
          businessPhone: params.businessPhone,
          businessId: params.businessId,
          error: error?.message,
          status: error?.response?.status,
        },
        'Falha ao consultar modo de IA da conversa; seguindo com IA ativa por fallback',
      )
      return DEFAULT_RESULT
    }
  }
}
