import { Request, Response } from 'express'
import { env } from 'process'
import { ContextService } from '../context/contextService'
import { markMessageAsRead } from '../../api/meta.api'
import { ConversationEventsClient } from '../conversations/conversation-events.client'
import { ConversationRuntimeClient } from '../conversations/conversation-runtime.client'
import { setUserContext } from '../../env.config'
import { createRequestLatencyTracker } from '../../utils/request-latency'
import { whatsappLogger } from '../../utils/pino'

export class WebhookService {
  private static instance: WebhookService

  static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService()
    }
    return WebhookService.instance
  }
  private readonly contextService = ContextService.getInstance()
  handleVerification = async (req: Request, res: Response) => {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED')
      res.status(200).send(challenge)
    }
  }

  webhookInitiator = async (req: Request, res: Response) => {
    res.sendStatus(200)

    const body = req.body

    if (body.object !== 'whatsapp_business_account') return

    const changeValue = body.entry?.[0]?.changes?.[0]?.value
    const messageData = changeValue?.messages?.[0]
    const statusEvents = Array.isArray(changeValue?.statuses) ? changeValue.statuses : []
    const businessPhone = changeValue?.metadata?.display_phone_number
    const phoneNumberId = changeValue?.metadata?.phone_number_id
    const requestId = String(messageData?.id || `status-${Date.now()}`)
    const trace = createRequestLatencyTracker(whatsappLogger, {
      requestId,
      clientPhone: messageData?.from ? String(messageData.from) : undefined,
      businessPhone: businessPhone || undefined,
    })

    for (const statusEvent of statusEvents) {
      trace.runDetached('emit_status_event', async () => {
        await ConversationEventsClient.emitStatusFromWebhook({
          statusData: statusEvent,
          businessPhone,
          rawPayload: statusEvent,
        })
      })
    }

    if (!messageData?.id || !messageData?.from) return

    try {
      const userId = String(messageData.from)

      await trace.run('persist_minimal_context', async () => {
        await setUserContext(userId, {
          businessPhone: businessPhone || undefined,
          phoneNumberId: phoneNumberId || undefined,
        })
      })

      trace.runDetached('emit_inbound_event', async () => {
        await ConversationEventsClient.emitInboundFromWebhook({
          messageData,
          businessPhone,
          rawPayload: messageData,
        })
      })

      const aiMode = await trace.run('get_ai_mode', async () =>
        ConversationRuntimeClient.getAiMode({
          clientPhone: userId,
          businessPhone,
        }),
      )

      trace.runDetached('mark_message_as_read', async () => {
        await markMessageAsRead(messageData.id, {
          businessPhone,
          phoneNumberId,
          contextPhone: userId,
        })
      })

      if (aiMode.shouldBlockBotReply) {
        console.log('[WebhookService] Resposta da IA bloqueada (modo manual)', {
          clientPhone: messageData.from,
          businessPhone,
          conversationId: aiMode.conversationId,
        })
        trace.finish({
          result: 'blocked_manual_mode',
          conversationId: aiMode.conversationId,
        })
        return
      }

      await trace.run('handle_incoming_message', async () => {
        await this.contextService.handleIncomingMessage(messageData, businessPhone, phoneNumberId)
      })
      trace.finish({ result: 'processed' })
    } catch (error) {
      console.error('[WebhookService] Erro inesperado ao processar webhook:', error)
      trace.finish({ result: 'error' })
      try {
        const userId = messageData?.from
        if (userId) {
          const { sendWhatsAppMessage } = await import('../../api/meta.api')
          await sendWhatsAppMessage(userId, 'Desculpe, ocorreu um erro inesperado. Tente novamente em instantes.')
        }
      } catch (sendError) {
        console.error('[WebhookService] Erro ao enviar mensagem de erro:', sendError)
      }
    }
  }
}
