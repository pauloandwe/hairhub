import axios from 'axios'
import { env } from '../env.config'
import type { ListRow } from '../utils/interactive'
import { withAssistantTitlePhone } from '../utils/message'
import { whatsappLogger } from '../utils/pino'
import { cancelTypingIndicatorForUser } from '../utils/typingIndicatorManager'

const WHATSAPP_API_VERSION = env.WHATSAPP_API_VERSION
const PHONE_NUMBER_ID = env.PHONE_NUMBER_ID
const META_ACCESS_TOKEN = env.META_ACCESS_TOKEN
const metaApi = axios.create({
  baseURL: `https://graph.facebook.com/${WHATSAPP_API_VERSION}`,
})

export function sendWhatsAppMessageWithTitle(to: string, text: string): Promise<void> {
  const message = withAssistantTitlePhone(text, to)

  return sendWhatsAppMessage(to, message)
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
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

    await metaApi.post(
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
  } catch (error: any) {
    whatsappLogger.error(
      {
        context: 'WhatsApp',
        receiver: to,
        message: text,
        error: error,
      },
      'Failed to send message to WhatsApp receiver',
    )
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

  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: header ? { type: 'text', text: header } : undefined,
      body: { text: body },
      footer: footer ? { text: footer } : undefined,
      action: {
        button: buttonLabel,
        sections: [
          {
            title: sectionTitle,
            rows: rows.map((r) => ({
              id: r?.id,
              title: r?.title,
              description: r?.description,
            })),
          },
          ...(extraSections || []).map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({
              id: r?.id,
              title: r?.title,
              description: r?.description,
            })),
          })),
        ],
      },
    },
  }

  try {
    whatsappLogger.info(
      {
        receiver: to,
        message: body,
        button: buttonLabel,
        rows: rows.map((r) => ({
          id: r?.id,
          title: r?.title,
        })),
      },
      'Sending interactive list to WhatsApp receiver',
    )
    await metaApi.post(`/${PHONE_NUMBER_ID}/messages`, payload, {
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })
  } catch (error: any) {
    whatsappLogger.error(
      {
        receiver: to,
        error: error,
      },
      'Failed to send interactive list to WhatsApp receiver',
    )
  }
}

export async function sendWhatsAppInteractiveButtons(params: { to: string; body: string; header?: string; footer?: string; buttons: { id: string; title: string }[] }): Promise<void> {
  const { to, body, header, footer, buttons } = params

  cancelTypingIndicatorForUser(to)

  if (!PHONE_NUMBER_ID || !META_ACCESS_TOKEN) {
    throw new Error('Variáveis de ambiente PHONE_NUMBER_ID e META_ACCESS_TOKEN são obrigatórias.')
  }

  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: header ? { type: 'text', text: header } : undefined,
      body: { text: body },
      footer: footer ? { text: footer } : undefined,
      action: {
        buttons: buttons.map((b) => ({
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
        message: body,
        buttons: buttons.map((b) => ({
          id: b.id,
          title: b.title,
        })),
      },
      'Sending interactive buttons to WhatsApp receiver',
    )
    await metaApi.post(`/${PHONE_NUMBER_ID}/messages`, payload, {
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })
  } catch (error: any) {
    whatsappLogger.error(
      {
        receiver: to,
        error: error,
      },
      'Failed to send interactive buttons to WhatsApp receiver',
    )
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
        error: error,
      },
      'Failed to mark message as read',
    )
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
