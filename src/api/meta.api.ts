import axios from 'axios'
import { env } from '../env.config'
import { getBusinessPhoneForPhone, getPhoneNumberIdForPhone, getUserContextSync, setUserContext } from '../env.config'
import type { ListRow } from '../utils/interactive'
import { withAssistantTitlePhone } from '../utils/message'
import { whatsappLogger } from '../utils/pino'
import { cancelTypingIndicatorForUser } from '../utils/typingIndicatorManager'
import { ConversationEventsClient } from '../services/conversations/conversation-events.client'
import { usersService } from '../services/users/users.service'
import { unwrapApiResponse } from '../utils/http'

const WHATSAPP_API_VERSION = env.WHATSAPP_API_VERSION
const META_ACCESS_TOKEN = env.META_ACCESS_TOKEN
const SAFE_RETRYABLE_CODES = new Set(['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE'])

function resolvePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function resolveNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}

const WHATSAPP_SEND_TIMEOUT_MS = resolvePositiveInteger(env.WHATSAPP_SEND_TIMEOUT_MS, 10000)
const WHATSAPP_SEND_SAFE_RETRY_ATTEMPTS = resolveNonNegativeInteger(env.WHATSAPP_SEND_SAFE_RETRY_ATTEMPTS, 1)

const metaApi = axios.create({
  baseURL: `https://graph.facebook.com/${WHATSAPP_API_VERSION}`,
  timeout: WHATSAPP_SEND_TIMEOUT_MS,
})

type BufferedOperation = () => Promise<void>
const outboundCaptureByUser = new Map<string, BufferedOperation[]>()

interface ResolvePhoneNumberIdOptions {
  businessPhone?: string
  phoneNumberId?: string
  contextPhone?: string
}

export function beginOutboundCapture(userId: string): void {
  if (!userId) return
  outboundCaptureByUser.set(userId, [])
}

export function clearOutboundCapture(userId: string): void {
  if (!userId) return
  outboundCaptureByUser.delete(userId)
}

export async function flushOutboundCapture(userId: string): Promise<void> {
  const operations = outboundCaptureByUser.get(userId)
  if (!operations) return

  outboundCaptureByUser.delete(userId)
  for (const operation of operations) {
    await operation()
  }
}

function enqueueOutboundCapture(userId: string, operation: BufferedOperation): boolean {
  const queue = outboundCaptureByUser.get(userId)
  if (!queue) return false
  queue.push(operation)
  return true
}

async function resolvePhoneNumberId(options?: ResolvePhoneNumberIdOptions): Promise<{ phoneNumberId: string; businessPhone?: string }> {
  const providedPhoneNumberId = String(options?.phoneNumberId || '').trim()
  if (providedPhoneNumberId) {
    return {
      phoneNumberId: providedPhoneNumberId,
      businessPhone: options?.businessPhone,
    }
  }

  const contextPhone = String(options?.contextPhone || '').trim()
  const context = contextPhone ? getUserContextSync(contextPhone) : undefined
  const contextPhoneNumberId = contextPhone ? String(getPhoneNumberIdForPhone(contextPhone) || '').trim() : ''
  if (contextPhoneNumberId) {
    return {
      phoneNumberId: contextPhoneNumberId,
      businessPhone: String(options?.businessPhone || context?.businessPhone || '').trim() || undefined,
    }
  }

  const businessPhone = String(options?.businessPhone || context?.businessPhone || (contextPhone ? getBusinessPhoneForPhone(contextPhone) : '') || '').trim()

  if (!businessPhone) {
    throw new Error('Não consegui identificar o businessPhone para resolver o phoneNumberId.')
  }

  const clientPhone = contextPhone || businessPhone
  const responseBusiness = await usersService.getBusinessByPhone(businessPhone, clientPhone)
  const payload = unwrapApiResponse<any>(responseBusiness)
  const resolvedPhoneNumberId = String(payload?.phoneNumberId || '').trim()

  if (!resolvedPhoneNumberId) {
    throw new Error(`A business com telefone ${businessPhone} não possui phoneNumberId cadastrado.`)
  }

  if (contextPhone) {
    await setUserContext(contextPhone, {
      businessPhone,
      phoneNumberId: resolvedPhoneNumberId,
      businessId: payload?.id ? String(payload.id) : undefined,
      businessName: payload?.name,
      businessType: payload?.type,
      assistantContext: payload?.assistantContext ?? undefined,
    })
  }

  return {
    phoneNumberId: resolvedPhoneNumberId,
    businessPhone,
  }
}

type PostToWhatsAppFn = (phoneNumberId: string, payload: Record<string, any>) => Promise<any>

export function shouldRetryWhatsAppSend(error: any): { retry: boolean; reason: string } {
  if (error?.response) {
    return { retry: false, reason: 'response_received' }
  }

  const code = String(error?.code || error?.cause?.code || '').trim().toUpperCase()
  if (!SAFE_RETRYABLE_CODES.has(code)) {
    return { retry: false, reason: code ? `non_retryable_code:${code}` : 'missing_retryable_code' }
  }

  const currentRequest = error?.request?._currentRequest ?? error?.request
  const bytesWrittenCandidates = [currentRequest?.socket?.bytesWritten, currentRequest?.bytesWritten, error?.request?.socket?.bytesWritten]
  const bytesWritten = bytesWrittenCandidates.find((value) => Number.isFinite(value))
  const headerSent = Boolean(currentRequest?._headerSent ?? error?.request?._headerSent)
  const finished = Boolean(currentRequest?.finished)
  const ended = Boolean(currentRequest?._ended ?? error?.request?._ended)

  if (Number.isFinite(bytesWritten as number)) {
    return Number(bytesWritten) === 0 && !finished
      ? { retry: true, reason: `pre_send_safe:${code}` }
      : { retry: false, reason: `request_progressed:${code}` }
  }

  if (!headerSent && !finished && !ended) {
    return { retry: true, reason: `pre_header_safe:${code}` }
  }

  return { retry: false, reason: `insufficient_pre_send_evidence:${code}` }
}

export async function postToWhatsAppWithRetry(
  phoneNumberId: string,
  payload: Record<string, any>,
  options?: {
    sendFn?: PostToWhatsAppFn
    maxRetries?: number
  },
) {
  if (!META_ACCESS_TOKEN) {
    throw new Error('Variável de ambiente META_ACCESS_TOKEN é obrigatória.')
  }

  const sendFn: PostToWhatsAppFn =
    options?.sendFn ||
    ((resolvedPhoneNumberId, resolvedPayload) =>
      metaApi.post(`/${resolvedPhoneNumberId}/messages`, resolvedPayload, {
        headers: {
          Authorization: `Bearer ${META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }))

  const maxRetries = options?.maxRetries ?? WHATSAPP_SEND_SAFE_RETRY_ATTEMPTS
  let attempt = 0

  while (true) {
    try {
      return await sendFn(phoneNumberId, payload)
    } catch (error: any) {
      const retryDecision = shouldRetryWhatsAppSend(error)
      const canRetry = retryDecision.retry && attempt < maxRetries

      whatsappLogger.warn(
        {
          phoneNumberId,
          payloadType: payload?.type,
          receiver: payload?.to,
          attempt: attempt + 1,
          maxRetries,
          retryDecision,
          errorCode: error?.code || error?.cause?.code,
          responseStatus: error?.response?.status,
        },
        canRetry ? 'Retrying WhatsApp send after safe transient failure' : 'WhatsApp send will not be retried',
      )

      if (!canRetry) {
        throw error
      }

      attempt += 1
    }
  }
}

async function postToWhatsApp(phoneNumberId: string, payload: Record<string, any>) {
  return postToWhatsAppWithRetry(phoneNumberId, payload)
}

export function sendWhatsAppMessageWithTitle(to: string, text: string, options?: SendWhatsAppMessageOptions): Promise<string> {
  const message = withAssistantTitlePhone(text, to)

  return sendWhatsAppMessage(to, message, options)
}

export interface SendWhatsAppMessageOptions {
  source?: 'BOT' | 'SYSTEM' | 'HUMAN_PANEL' | 'OUTREACH' | 'REMINDER'
  businessId?: string | number
  businessPhone?: string
  phoneNumberId?: string
  metadata?: Record<string, any>
  suppressConversationEvent?: boolean
}

export interface SendWhatsAppInteractiveOptions {
  source?: 'BOT' | 'SYSTEM' | 'HUMAN_PANEL' | 'OUTREACH' | 'REMINDER'
  businessId?: string | number
  businessPhone?: string
  phoneNumberId?: string
  metadata?: Record<string, any>
  suppressConversationEvent?: boolean
}

export async function sendWhatsAppMessage(to: string, text: string, options?: SendWhatsAppMessageOptions): Promise<string> {
  if (
    enqueueOutboundCapture(to, async () => {
      await sendWhatsAppMessage(to, text, options)
    })
  ) {
    return 'buffered'
  }

  cancelTypingIndicatorForUser(to)

  try {
    const resolved = await resolvePhoneNumberId({
      businessPhone: options?.businessPhone,
      phoneNumberId: options?.phoneNumberId,
      contextPhone: to,
    })

    whatsappLogger.info(
      {
        receiver: to,
        message: text,
        businessPhone: resolved.businessPhone,
        phoneNumberId: resolved.phoneNumberId,
      },
      'Sending message to WhatsApp receiver',
    )

    const response = await postToWhatsApp(resolved.phoneNumberId, {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: {
        body: text,
      },
    })
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
          businessPhone: options?.businessPhone || resolved.businessPhone,
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

export async function sendWhatsAppTypingIndicator(params: { messageId: string; typingType?: 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker'; businessPhone?: string; phoneNumberId?: string; contextPhone?: string }): Promise<void> {
  const { messageId, typingType = 'text' } = params

  try {
    const resolved = await resolvePhoneNumberId({
      businessPhone: params.businessPhone,
      phoneNumberId: params.phoneNumberId,
      contextPhone: params.contextPhone,
    })
    const payload = {
      messaging_product: 'whatsapp',
      status: 'read' as const,
      message_id: messageId,
      typing_indicator: {
        type: typingType,
      },
    }

    whatsappLogger.info({ messageId, typingType, payload }, 'Sending typing indicator to WhatsApp receiver')

    await postToWhatsApp(resolved.phoneNumberId, payload)
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
  options?: SendWhatsAppInteractiveOptions
}): Promise<void> {
  const { to, header, body, footer, buttonLabel = 'Selecionar', rows, sectionTitle = 'Itens', extraSections, options } = params

  if (
    enqueueOutboundCapture(to, async () => {
      await sendWhatsAppInteractiveList(params)
    })
  ) {
    return
  }

  cancelTypingIndicatorForUser(to)

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
    const resolved = await resolvePhoneNumberId({
      businessPhone: options?.businessPhone,
      phoneNumberId: options?.phoneNumberId,
      contextPhone: to,
    })
    whatsappLogger.info(
      {
        receiver: to,
        message: sanitizedBody,
        businessPhone: resolved.businessPhone,
        phoneNumberId: resolved.phoneNumberId,
        button: sanitizedButtonLabel,
        rows: sanitizedRows.map((r) => ({
          id: r?.id,
          title: r?.title,
        })),
      },
      'Sending interactive list to WhatsApp receiver',
    )
    const response = await postToWhatsApp(resolved.phoneNumberId, payload)

    const messageId = response.data?.messages?.[0]?.id
    if (messageId) {
      try {
        await ConversationEventsClient.emitOutboundMessage({
          clientPhone: to,
          text: sanitizedBody,
          source: options?.source || 'BOT',
          businessId: options?.businessId,
          businessPhone: options?.businessPhone || resolved.businessPhone,
          providerMessageId: String(messageId),
          providerStatus: 'SENT',
          rawPayload: response.data || null,
          metadata: {
            ...(options?.metadata || {}),
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

export async function sendWhatsAppInteractiveButtons(params: { to: string; body: string; header?: string; footer?: string; buttons: { id: string; title: string }[]; options?: SendWhatsAppInteractiveOptions }): Promise<string> {
  const { to, body, header, footer, buttons, options } = params

  if (
    enqueueOutboundCapture(to, async () => {
      await sendWhatsAppInteractiveButtons(params)
    })
  ) {
    return 'buffered'
  }

  cancelTypingIndicatorForUser(to)

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
    const resolved = await resolvePhoneNumberId({
      businessPhone: options?.businessPhone,
      phoneNumberId: options?.phoneNumberId,
      contextPhone: to,
    })
    whatsappLogger.info(
      {
        receiver: to,
        message: sanitizedBody,
        businessPhone: resolved.businessPhone,
        phoneNumberId: resolved.phoneNumberId,
        buttons: sanitizedButtons.map((b) => ({
          id: b.id,
          title: b.title,
        })),
      },
      'Sending interactive buttons to WhatsApp receiver',
    )
    const response = await postToWhatsApp(resolved.phoneNumberId, payload)

    const messageId = response.data?.messages?.[0]?.id
    if (messageId && !options?.suppressConversationEvent) {
      try {
        await ConversationEventsClient.emitOutboundMessage({
          clientPhone: to,
          text: sanitizedBody,
          source: options?.source || 'BOT',
          businessId: options?.businessId,
          businessPhone: options?.businessPhone || resolved.businessPhone,
          providerMessageId: String(messageId),
          providerStatus: 'SENT',
          rawPayload: response.data || null,
          metadata: {
            ...(options?.metadata || {}),
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

    return messageId || 'unknown'
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

export async function markMessageAsRead(messageId: string, options?: ResolvePhoneNumberIdOptions): Promise<void> {
  try {
    const resolved = await resolvePhoneNumberId(options)
    await postToWhatsApp(resolved.phoneNumberId, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    })
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
