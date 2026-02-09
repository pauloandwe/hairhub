import { Router, Request, Response } from 'express'
import { ReminderSenderService } from '../reminders/reminder-sender.service'
import { setOutreachContext, hasActiveOutreach, OutreachType } from './outreach-context.service'
import { whatsappLogger } from '../../utils/pino'
import { env } from '../../env.config'

const router = Router()

function validateToken(req: Request, res: Response): boolean {
  const token = req.headers['x-reminder-token'] || req.headers['authorization']
  const expectedToken = env.WHATSAPP_WEBHOOK_SECRET

  if (!token || token !== `Bearer ${expectedToken}`) {
    whatsappLogger.warn(
      {
        token: token ? '***' : 'none',
      },
      'Tentativa de acesso não autorizado ao endpoint de outreach',
    )
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Token de autenticação inválido ou ausente',
    })
    return false
  }
  return true
}

export interface OutreachSendPayload {
  clientPhone: string
  message: string
  type: OutreachType
  businessId: string
  businessPhone: string
  businessName: string
  clientName: string | null
  metadata?: Record<string, any>
}

router.post('/api/outreach/send', async (req: Request, res: Response) => {
  if (!validateToken(req, res)) {
    return
  }

  try {
    const payload: OutreachSendPayload = req.body

    if (!payload.clientPhone || !payload.message || !payload.type || !payload.businessId) {
      whatsappLogger.warn({ payload }, 'Payload inválido para envio de outreach')
      return res.status(400).json({
        error: 'Invalid payload',
        message: 'clientPhone, message, type e businessId são obrigatórios',
      })
    }

    const alreadySent = await hasActiveOutreach(payload.clientPhone)
    if (alreadySent) {
      whatsappLogger.info(
        { clientPhone: payload.clientPhone },
        'Outreach bloqueado por cooldown - mensagem já enviada nas últimas 24h',
      )
      return res.status(429).json({
        error: 'Cooldown active',
        message: 'Já foi enviada uma mensagem para este cliente nas últimas 24 horas',
      })
    }

    whatsappLogger.info(
      {
        clientPhone: payload.clientPhone,
        type: payload.type,
        businessId: payload.businessId,
      },
      'Enviando mensagem de outreach',
    )

    const result = await ReminderSenderService.sendReminder({
      businessPhone: payload.businessPhone,
      clientPhone: payload.clientPhone,
      message: payload.message,
      appointmentId: 0,
      type: `outreach-${payload.type}`,
    })

    if (!result.success) {
      whatsappLogger.error(
        { clientPhone: payload.clientPhone, error: result.error },
        'Falha ao enviar mensagem de outreach',
      )
      return res.status(500).json({
        success: false,
        error: result.error || 'Falha ao enviar mensagem',
      })
    }

    await setOutreachContext(payload.clientPhone, {
      type: payload.type,
      businessId: payload.businessId,
      businessPhone: payload.businessPhone,
      businessName: payload.businessName,
      clientName: payload.clientName,
      sentAt: new Date().toISOString(),
      message: payload.message,
      metadata: payload.metadata || {},
    })

    whatsappLogger.info(
      {
        clientPhone: payload.clientPhone,
        type: payload.type,
        messageId: result.messageId,
      },
      'Outreach enviado com sucesso e flag Redis setada',
    )

    res.status(200).json({
      success: true,
      messageId: result.messageId,
      clientPhone: payload.clientPhone,
      type: payload.type,
    })
  } catch (error: any) {
    whatsappLogger.error(
      { error: error?.message, stack: error?.stack },
      'Erro ao processar requisição de outreach',
    )
    res.status(500).json({
      error: 'Internal server error',
      message: error?.message || 'Erro ao processar requisição de outreach',
    })
  }
})

export { router as outreachRouter }
