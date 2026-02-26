import { Request, Response } from 'express'
import { env } from 'process'
import { ContextService } from '../context/contextService'
import { markMessageAsRead } from '../../api/meta.api'
import { ConversationEventsClient } from '../conversations/conversation-events.client'
import { ConversationRuntimeClient } from '../conversations/conversation-runtime.client'

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

    for (const statusEvent of statusEvents) {
      try {
        await ConversationEventsClient.emitStatusFromWebhook({
          statusData: statusEvent,
          businessPhone,
          rawPayload: statusEvent,
        })
      } catch (statusError) {
        console.error('[WebhookService] Erro ao persistir status de mensagem:', statusError)
      }
    }

    if (!messageData?.id || !messageData?.from) return

    try {
      await ConversationEventsClient.emitInboundFromWebhook({
        messageData,
        businessPhone,
        rawPayload: messageData,
      })

      const aiMode = await ConversationRuntimeClient.getAiMode({
        clientPhone: String(messageData.from),
        businessPhone,
      })

      await markMessageAsRead(messageData.id)

      if (aiMode.shouldBlockBotReply) {
        console.log('[WebhookService] Resposta da IA bloqueada (modo manual)', {
          clientPhone: messageData.from,
          businessPhone,
          conversationId: aiMode.conversationId,
        })
        return
      }

      await this.contextService.handleIncomingMessage(messageData, businessPhone)
    } catch (error) {
      console.error('[WebhookService] Erro inesperado ao processar webhook:', error)
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
