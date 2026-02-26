import { Router, Request, Response } from 'express'
import { env } from '../../env.config'
import { whatsappLogger } from '../../utils/pino'
import { ReminderSenderService } from '../reminders/reminder-sender.service'

const router = Router()

function validateToken(req: Request, res: Response): boolean {
  const token = req.headers['x-reminder-token'] || req.headers['authorization']
  const expectedToken = env.WHATSAPP_WEBHOOK_SECRET

  if (!token || token !== `Bearer ${expectedToken}`) {
    whatsappLogger.warn(
      {
        token: token ? '***' : 'none',
      },
      'Tentativa de acesso não autorizado ao endpoint de mensagens do painel',
    )
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Token de autenticação inválido ou ausente',
    })
    return false
  }

  return true
}

interface PanelMessagePayload {
  businessId: string
  businessPhone?: string
  businessName?: string
  clientPhone: string
  clientName?: string | null
  message: string
  source?: string
}

router.post('/api/messages/send', async (req: Request, res: Response) => {
  if (!validateToken(req, res)) {
    return
  }

  try {
    const payload = req.body as PanelMessagePayload
    const message = String(payload?.message || '').trim()
    const clientPhone = String(payload?.clientPhone || '').trim()
    const businessId = String(payload?.businessId || '').trim()

    if (!businessId || !clientPhone || !message) {
      return res.status(400).json({
        error: 'Invalid payload',
        message: 'businessId, clientPhone e message são obrigatórios',
      })
    }

    const result = await ReminderSenderService.sendReminder({
      businessPhone: String(payload.businessPhone || ''),
      clientPhone,
      message,
      appointmentId: 0,
      type: 'panel-manual-message',
      businessId,
      source: 'HUMAN_PANEL',
      metadata: {
        businessName: payload.businessName || null,
        clientName: payload.clientName || null,
        initiatedBy: 'panel',
      },
    })

    return res.status(result.success ? 200 : 500).json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      clientPhone,
    })
  } catch (error: any) {
    whatsappLogger.error(
      {
        error: error?.message,
        stack: error?.stack,
      },
      'Erro ao processar envio manual do painel',
    )

    return res.status(500).json({
      error: 'Internal server error',
      message: error?.message || 'Erro ao processar envio manual',
    })
  }
})

export { router as panelMessagesRouter }
