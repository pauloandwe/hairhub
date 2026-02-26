import axios from 'axios'
import { env, getUserContext } from '../../env.config'
import { whatsappLogger } from '../../utils/pino'

export type ConversationEventType = 'MESSAGE_INBOUND' | 'MESSAGE_OUTBOUND' | 'MESSAGE_STATUS'

export interface ConversationEventPayload {
  eventType: ConversationEventType
  businessId?: string | number
  businessPhone?: string
  clientPhone?: string
  provider?: string
  providerMessageId?: string
  providerStatus?: string
  source?: string
  messageType?: string
  text?: string | null
  rawPayload?: Record<string, any> | null
  metadata?: Record<string, any> | null
  errorMessage?: string | null
  timestamp?: string
}

interface OutboundMessageEventInput {
  clientPhone: string
  text?: string | null
  source?: string
  businessId?: string | number | null
  businessPhone?: string | null
  providerMessageId?: string | null
  providerStatus?: string | null
  rawPayload?: Record<string, any> | null
  metadata?: Record<string, any> | null
  errorMessage?: string | null
  timestamp?: string
}

export class ConversationEventsClient {
  private static readonly endpoint = `${env.BACKEND_URL}/client-conversations/events/whatsapp`

  static async emit(event: ConversationEventPayload): Promise<void> {
    const token = env.WHATSAPP_WEBHOOK_SECRET
    const payload = this.sanitizeEvent(event)
    if (!payload) {
      return
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Reminder-Token': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    let lastError: any
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await axios.post(this.endpoint, payload, {
          headers,
          timeout: 3000,
        })
        return
      } catch (error: any) {
        lastError = error
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
        }
      }
    }

    whatsappLogger.warn(
      {
        eventType: payload.eventType,
        clientPhone: payload.clientPhone,
        providerMessageId: payload.providerMessageId,
        error: lastError?.message,
        status: lastError?.response?.status,
      },
      'Falha ao enviar evento de conversa para o backend',
    )
  }

  static async emitInboundFromWebhook(params: {
    messageData: any
    businessPhone?: string
    rawPayload?: Record<string, any> | null
  }): Promise<void> {
    const { messageData, businessPhone, rawPayload } = params
    if (!messageData?.id || !messageData?.from) return

    const text = this.extractIncomingText(messageData)

    await this.emit({
      eventType: 'MESSAGE_INBOUND',
      businessPhone: businessPhone || undefined,
      clientPhone: String(messageData.from),
      provider: 'META_WHATSAPP',
      providerMessageId: String(messageData.id),
      providerStatus: 'RECEIVED',
      source: 'SYSTEM',
      messageType: this.normalizeMessageType(messageData?.type),
      text,
      rawPayload: rawPayload ?? (messageData as Record<string, any>),
      metadata: {
        webhookMessageType: messageData?.type || 'unknown',
      },
      timestamp: this.toIsoTimestamp(messageData?.timestamp),
    })
  }

  static async emitStatusFromWebhook(params: {
    statusData: any
    businessPhone?: string
    rawPayload?: Record<string, any> | null
  }): Promise<void> {
    const { statusData, businessPhone, rawPayload } = params
    if (!statusData?.id) return

    await this.emit({
      eventType: 'MESSAGE_STATUS',
      businessPhone: businessPhone || undefined,
      clientPhone: statusData?.recipient_id ? String(statusData.recipient_id) : undefined,
      provider: 'META_WHATSAPP',
      providerMessageId: String(statusData.id),
      providerStatus: this.normalizeProviderStatus(statusData?.status),
      source: 'SYSTEM',
      rawPayload: rawPayload ?? (statusData as Record<string, any>),
      metadata: {
        conversation: statusData?.conversation || undefined,
        pricing: statusData?.pricing || undefined,
      },
      errorMessage: statusData?.errors?.[0]?.title || statusData?.errors?.[0]?.message || null,
      timestamp: this.toIsoTimestamp(statusData?.timestamp),
    })
  }

  static async emitOutboundMessage(input: OutboundMessageEventInput): Promise<void> {
    const resolved = await this.resolveBusinessContext(
      input.clientPhone,
      input.businessId ?? undefined,
      input.businessPhone ?? undefined,
    )

    if (!resolved.businessId && !resolved.businessPhone) {
      whatsappLogger.debug(
        {
          clientPhone: input.clientPhone,
          source: input.source,
        },
        'Pulando evento outbound de conversa por falta de contexto do business',
      )
      return
    }

    await this.emit({
      eventType: 'MESSAGE_OUTBOUND',
      businessId: resolved.businessId || undefined,
      businessPhone: resolved.businessPhone || undefined,
      clientPhone: input.clientPhone,
      provider: 'META_WHATSAPP',
      providerMessageId: input.providerMessageId || undefined,
      providerStatus: this.normalizeProviderStatus(input.providerStatus) || 'SENT',
      source: input.source || 'BOT',
      messageType: 'TEXT',
      text: input.text ?? null,
      rawPayload: input.rawPayload ?? null,
      metadata: input.metadata ?? null,
      errorMessage: input.errorMessage ?? null,
      timestamp: input.timestamp || new Date().toISOString(),
    })
  }

  private static sanitizeEvent(event: ConversationEventPayload): ConversationEventPayload | null {
    if (!event?.eventType) return null

    const sanitized: ConversationEventPayload = {
      eventType: event.eventType,
    }

    for (const [key, value] of Object.entries(event)) {
      if (key === 'eventType') continue
      if (value === undefined) continue
      ;(sanitized as any)[key] = value
    }

    if (sanitized.eventType !== 'MESSAGE_STATUS' && !sanitized.clientPhone) {
      return null
    }

    return sanitized
  }

  private static async resolveBusinessContext(
    clientPhone: string,
    businessId?: string | number,
    businessPhone?: string,
  ): Promise<{ businessId?: string; businessPhone?: string }> {
    const normalizedBusinessId =
      businessId !== undefined && businessId !== null ? String(businessId).trim() : ''
    const normalizedBusinessPhone = businessPhone ? String(businessPhone).trim() : ''

    if (normalizedBusinessId || normalizedBusinessPhone) {
      return {
        businessId: normalizedBusinessId || undefined,
        businessPhone: normalizedBusinessPhone || undefined,
      }
    }

    try {
      const context = await getUserContext(clientPhone)
      return {
        businessId: context?.businessId ? String(context.businessId).trim() : undefined,
        businessPhone: context?.businessPhone ? String(context.businessPhone).trim() : undefined,
      }
    } catch (error: any) {
      whatsappLogger.debug(
        {
          clientPhone,
          error: error?.message,
        },
        'Falha ao resolver contexto do business para evento de conversa',
      )
      return {}
    }
  }

  private static extractIncomingText(messageData: any): string | null {
    const type = String(messageData?.type || '').toLowerCase()
    if (type === 'text') {
      return messageData?.text?.body || null
    }

    if (type === 'interactive') {
      const reply = messageData?.interactive?.button_reply || messageData?.interactive?.list_reply
      return reply?.title || reply?.id || '[Interação]'
    }

    if (type === 'audio') return '[Áudio recebido]'
    if (type === 'image') return messageData?.image?.caption || '[Imagem recebida]'
    if (type === 'video') return messageData?.video?.caption || '[Vídeo recebido]'
    if (type === 'document') return messageData?.document?.filename || '[Documento recebido]'

    return null
  }

  private static normalizeMessageType(value?: string): string {
    return value ? String(value).toUpperCase() : 'TEXT'
  }

  private static normalizeProviderStatus(value?: string | null): string | undefined {
    if (!value) return undefined
    const normalized = String(value).trim().toUpperCase()
    if (!normalized) return undefined
    if (normalized === 'FAILED' || normalized === 'ERROR') return 'FAILED'
    return normalized
  }

  private static toIsoTimestamp(value: any): string | undefined {
    if (value === undefined || value === null) return undefined
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) {
      // Meta envia epoch em segundos.
      const millis = String(value).length <= 10 ? asNumber * 1000 : asNumber
      return new Date(millis).toISOString()
    }

    const parsed = new Date(String(value))
    if (Number.isNaN(parsed.getTime())) return undefined
    return parsed.toISOString()
  }
}
