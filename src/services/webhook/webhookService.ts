import { Request, Response } from 'express'
import { env } from 'process'
import { ContextService } from '../context/contextService'

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

    const messageData = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]

    if (!messageData?.id || !messageData?.from) return

    try {
      // await markMessageAsRead(messageData.id)
      await this.contextService.handleIncomingMessage(messageData)
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
