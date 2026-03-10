import { Router, Request, Response } from 'express'
import { env } from '../../env.config'
import { whatsappLogger } from '../../utils/pino'
import { ReminderSenderService } from '../reminders/reminder-sender.service'
import { sendWhatsAppInteractiveButtons } from '../../api/meta.api'
import { ClientQuickActionType, mapClientQuickActionsToButtons } from '../../interactives/clientQuickActions'

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
  quickActions?: ClientQuickActionType[]
}

const VALID_QUICK_ACTIONS = new Set<ClientQuickActionType>(['BOOK_APPOINTMENT', 'RESCHEDULE_APPOINTMENT', 'CANCEL_APPOINTMENT'])

router.post('/api/messages/send', async (req: Request, res: Response) => {
  if (!validateToken(req, res)) {
    return
  }

  try {
    const payload = req.body as PanelMessagePayload
    const message = String(payload?.message || '').trim()
    const clientPhone = String(payload?.clientPhone || '').trim()
    const businessId = String(payload?.businessId || '').trim()
    const businessPhone = String(payload?.businessPhone || '')
      .replace(/\D/g, '')
      .trim()
    const quickActions = Array.isArray(payload?.quickActions) ? payload.quickActions.filter((action): action is ClientQuickActionType => VALID_QUICK_ACTIONS.has(action)) : []

    if (!businessId || !clientPhone || !message) {
      return res.status(400).json({
        error: 'Invalid payload',
        message: 'businessId, clientPhone e message são obrigatórios',
      })
    }

    if (quickActions.length > 0) {
      if (!businessPhone) {
        whatsappLogger.warn(
          {
            businessId,
            clientPhone,
            quickActions,
          },
          'Mensagem com ações rápidas recebida sem businessPhone. Enviando fallback sem botões.',
        )
      } else {
        const buttons = mapClientQuickActionsToButtons(businessPhone, quickActions)

        const messageId = await sendWhatsAppInteractiveButtons({
          to: clientPhone,
          body: message,
          buttons,
          options: {
            source: 'HUMAN_PANEL',
            businessId,
            businessPhone,
            metadata: {
              businessName: payload.businessName || null,
              clientName: payload.clientName || null,
              initiatedBy: 'panel',
              quickActions,
            },
          },
        })

        return res.status(200).json({
          success: true,
          messageId,
          clientPhone,
        })
      }
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
