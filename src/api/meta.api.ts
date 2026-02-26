import axios from 'axios'
import { env } from '../env.config'
import type { ListRow } from '../utils/interactive'
import { withAssistantTitlePhone } from '../utils/message'
import { whatsappLogger } from '../utils/pino'
import { cancelTypingIndicatorForUser } from '../utils/typingIndicatorManager'
import { ConversationEventsClient } from '../services/conversations/conversation-events.client'

const WHATSAPP_API_VERSION = env.WHATSAPP_API_VERSION
const PHONE_NUMBER_ID = env.PHONE_NUMBER_ID
const META_ACCESS_TOKEN = env.META_ACCESS_TOKEN
const metaApi = axios.create({
  baseURL: `https://graph.facebook.com/${WHATSAPP_API_VERSION}`,
})

export function sendWhatsAppMessageWithTitle(to: string, text: string, options?: SendWhatsAppMessageOptions): Promise<string> {
  const message = withAssistantTitlePhone(text, to)

  return sendWhatsAppMessage(to, message, options)
}

export interface SendWhatsAppMessageOptions {
  source?: 'BOT' | 'SYSTEM' | 'HUMAN_PANEL' | 'OUTREACH' | 'REMINDER'
  businessId?: string | number
  businessPhone?: string
  metadata?: Record<string, any>
  suppressConversationEvent?: boolean
}

export async function sendWhatsAppMessage(to: string, text: string, options?: SendWhatsAppMessageOptions): Promise<string> {
  cancelTypingIndicatorForUser(to)

  if (!PHONE_NUMBER_ID || !META_ACCESS_TOKEN) {
    throw new Error('Variáveis de ambiente PHONE_NUMBER_ID e META_ACCESS_TOKEN são obrigatórias.')
  }

  try {
    whatsappLogger.info(
      {
        receiver: to,
        message: text,
      },
      'Sending message to WhatsApp receiver',
    )

    const response = await metaApi.post(
      `/${PHONE_NUMBER_ID}/messages`,
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
      },
    )
    whatsappLogger.info(
      {
        receiver: to,
      },
      'Message sent successfully',
    )

    const messageId = response.data?.messages?.[0]?.id || 'unknown'

    if (!options?.suppressConversationEvent) {
      try {
        await ConversationEventsClient.emitOutboundMessage({
          clientPhone: to,
          text,
          source: options?.source || 'BOT',
          businessId: options?.businessId,
          businessPhone: options?.businessPhone,
          providerMessageId: messageId,
          providerStatus: 'SENT',
          rawPayload: response.data || null,
          metadata: options?.metadata || null,
        })
      } catch (emitError: any) {
        whatsappLogger.warn(
          {
            receiver: to,
            messageId,
            error: emitError?.message,
          },
          'Falha ao emitir evento outbound de conversa após envio WhatsApp',
        )
      }
    }

    return messageId
  } catch (error: any) {
    whatsappLogger.error(
      {
        context: 'WhatsApp',
        receiver: to,
        message: text,
        responseStatus: error?.response?.status,
        responseData: error?.response?.data,
        error: error,
      },
      'Failed to send message to WhatsApp receiver',
    )
    throw error
  }
}

export async function sendWhatsAppTypingIndicator(params: { messageId: string; typingType?: 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker' }): Promise<void> {
  const { messageId, typingType = 'text' } = params

  if (!PHONE_NUMBER_ID || !META_ACCESS_TOKEN) {
    throw new Error('Variáveis de ambiente PHONE_NUMBER_ID e META_ACCESS_TOKEN são obrigatórias.')
  }

  try {
    const payload = {
      messaging_product: 'whatsapp',
      status: 'read' as const,
      message_id: messageId,
      typing_indicator: {
        type: typingType,
      },
    }

    whatsappLogger.info({ messageId, typingType, payload }, 'Sending typing indicator to WhatsApp receiver')

    await metaApi.post(`/${PHONE_NUMBER_ID}/messages`, payload, {
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })
  } catch (error: any) {
    whatsappLogger.error(
      {
        messageId,
        typingType,
        responseData: error?.response?.data,
        error,
      },
      'Failed to send typing indicator to WhatsApp receiver',
    )
  }
}

export async function sendWhatsAppInteractiveList(params: {
  to: string
  header?: string
  body: string
  footer?: string
  buttonLabel?: string
  rows: ListRow[]
  sectionTitle?: string
  extraSections?: {
    title: string
    rows: ListRow[]
  }[]
}): Promise<void> {
  const { to, header, body, footer, buttonLabel = 'Selecionar', rows, sectionTitle = 'Itens', extraSections } = params

  cancelTypingIndicatorForUser(to)

  if (!PHONE_NUMBER_ID || !META_ACCESS_TOKEN) {
    throw new Error('Variáveis de ambiente PHONE_NUMBER_ID e META_ACCESS_TOKEN são obrigatórias.')
  }

  const formatOptional = (value: string | undefined, maxLength: number): string | undefined => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    if (!trimmed) return undefined
    return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength)
  }

  const formatRequired = (value: string, maxLength: number): string => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength)
  }

  const sanitizeRows = (listRows: ListRow[]) =>
    listRows.map((r) => ({
      id: r?.id,
      title: formatRequired(r?.title ?? '', 24),
      description: formatOptional(r?.description, 72),
    }))

  const sanitizedButtonLabel = formatOptional(buttonLabel, 20) ?? 'Selecionar'
  const sanitizedHeader = formatOptional(header, 60)
  const sanitizedFooter = formatOptional(footer, 60)
  const sanitizedBody = formatRequired(body, 1024) || body
  const sanitizedSectionTitle = formatOptional(sectionTitle, 24) ?? 'Itens'
  const sanitizedRows = sanitizeRows(rows)
  const sanitizedExtraSections = (extraSections || []).map((s) => ({
    title: formatOptional(s.title, 24),
    rows: sanitizeRows(s.rows),
  }))

  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: sanitizedHeader ? { type: 'text', text: sanitizedHeader } : undefined,
      body: { text: sanitizedBody },
      footer: sanitizedFooter ? { text: sanitizedFooter } : undefined,
      action: {
        button: sanitizedButtonLabel,
        sections: [
          {
            title: sanitizedSectionTitle,
            rows: sanitizedRows,
          },
          ...sanitizedExtraSections,
        ],
      },
    },
  }

  try {
    whatsappLogger.info(
      {
        receiver: to,
        message: sanitizedBody,
        button: sanitizedButtonLabel,
        rows: sanitizedRows.map((r) => ({
          id: r?.id,
          title: r?.title,
        })),
      },
      'Sending interactive list to WhatsApp receiver',
    )
    const response = await metaApi.post(`/${PHONE_NUMBER_ID}/messages`, payload, {
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })

    const messageId = response.data?.messages?.[0]?.id
    if (messageId) {
      try {
        await ConversationEventsClient.emitOutboundMessage({
          clientPhone: to,
          text: sanitizedBody,
          source: 'BOT',
          providerMessageId: String(messageId),
          providerStatus: 'SENT',
          rawPayload: response.data || null,
          metadata: {
            interactiveType: 'list',
            header: sanitizedHeader || null,
            footer: sanitizedFooter || null,
            button: sanitizedButtonLabel,
            rows: sanitizedRows.map((r) => ({ id: r.id, title: r.title })),
          },
        })
      } catch (emitError: any) {
        whatsappLogger.warn({ receiver: to, messageId, error: emitError?.message }, 'Falha ao emitir evento de lista interativa')
      }
    }
  } catch (error: any) {
    whatsappLogger.error(
      {
        receiver: to,
        responseStatus: error?.response?.status,
        responseData: error?.response?.data,
        error: error,
      },
      'Failed to send interactive list to WhatsApp receiver',
    )
    throw error
  }
}

export async function sendWhatsAppInteractiveButtons(params: { to: string; body: string; header?: string; footer?: string; buttons: { id: string; title: string }[] }): Promise<void> {
  const { to, body, header, footer, buttons } = params

  cancelTypingIndicatorForUser(to)

  if (!PHONE_NUMBER_ID || !META_ACCESS_TOKEN) {
    throw new Error('Variáveis de ambiente PHONE_NUMBER_ID e META_ACCESS_TOKEN são obrigatórias.')
  }

  const formatOptional = (value: string | undefined, maxLength: number): string | undefined => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    if (!trimmed) return undefined
    return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength)
  }

  const formatRequired = (value: string, maxLength: number): string => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength)
  }

  const sanitizedHeader = formatOptional(header, 60)
  const sanitizedBody = formatRequired(body, 1024) || body
  const sanitizedFooter = formatOptional(footer, 60)
  const sanitizedButtons = buttons.map((b) => ({
    id: b.id,
    title: formatRequired(b.title, 20),
  }))

  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: sanitizedHeader ? { type: 'text', text: sanitizedHeader } : undefined,
      body: { text: sanitizedBody },
      footer: sanitizedFooter ? { text: sanitizedFooter } : undefined,
      action: {
        buttons: sanitizedButtons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  }

  try {
    whatsappLogger.info(
      {
        receiver: to,
        message: sanitizedBody,
        buttons: sanitizedButtons.map((b) => ({
          id: b.id,
          title: b.title,
        })),
      },
      'Sending interactive buttons to WhatsApp receiver',
    )
    const response = await metaApi.post(`/${PHONE_NUMBER_ID}/messages`, payload, {
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })

    const messageId = response.data?.messages?.[0]?.id
    if (messageId) {
      try {
        await ConversationEventsClient.emitOutboundMessage({
          clientPhone: to,
          text: sanitizedBody,
          source: 'BOT',
          providerMessageId: String(messageId),
          providerStatus: 'SENT',
          rawPayload: response.data || null,
          metadata: {
            interactiveType: 'button',
            header: sanitizedHeader || null,
            footer: sanitizedFooter || null,
            buttons: sanitizedButtons.map((b) => ({ id: b.id, title: b.title })),
          },
        })
      } catch (emitError: any) {
        whatsappLogger.warn({ receiver: to, messageId, error: emitError?.message }, 'Falha ao emitir evento de botões interativos')
      }
    }
  } catch (error: any) {
    whatsappLogger.error(
      {
        receiver: to,
        responseStatus: error?.response?.status,
        responseData: error?.response?.data,
        error: error,
      },
      'Failed to send interactive buttons to WhatsApp receiver',
    )
    throw error
  }
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  if (!PHONE_NUMBER_ID || !META_ACCESS_TOKEN) {
    throw new Error('Variáveis de ambiente PHONE_NUMBER_ID e META_ACCESS_TOKEN são obrigatórias.')
  }

  try {
    await metaApi.post(
      `/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    )
    whatsappLogger.info(
      {
        context: 'WhatsApp',
        message: messageId,
      },
      'Message marked as read',
    )
  } catch (error: any) {
    whatsappLogger.error(
      {
        message: messageId,
        responseStatus: error?.response?.status,
        responseData: error?.response?.data,
        error: error,
      },
      'Failed to mark message as read',
    )
    throw error
  }
}

export async function downloadMedia(mediaId: string): Promise<Buffer> {
  if (!META_ACCESS_TOKEN) {
    throw new Error('Variável de ambiente META_ACCESS_TOKEN é obrigatória.')
  }

  try {
    const mediaResponse = await metaApi.get(`/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      },
    })

    const url = mediaResponse.data.url

    const fileResponse = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      },
      responseType: 'arraybuffer',
    })

    return Buffer.from(fileResponse.data)
  } catch (error: any) {
    whatsappLogger.error(
      {
        media: mediaId,
        error: error,
      },
      'Failed to download media',
    )
    throw error
  }
}
