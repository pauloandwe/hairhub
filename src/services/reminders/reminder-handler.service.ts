import { Router, Request, Response } from 'express'
import { ReminderSenderService, SendReminderPayload, ReminderSendResponse } from './reminder-sender.service'
import { ReminderPreferencesService } from './reminder-preferences.service'
import { whatsappLogger } from '../../utils/pino'
import { env } from '../../env.config'

const router = Router()

whatsappLogger.info(
  {
    reminderTokenConfigured: env.WHATSAPP_WEBHOOK_SECRET !== 'default-secret',
    reminderTokenLength: env.WHATSAPP_WEBHOOK_SECRET ? env.WHATSAPP_WEBHOOK_SECRET.length : 0,
  },
  'Reminder handler initialized with token configuration',
)

function validateReminderToken(req: Request, res: Response, next: Function): boolean {
  const token = req.headers['x-reminder-token'] || req.headers['authorization']
  const expectedToken = env.WHATSAPP_WEBHOOK_SECRET

  if (!token || token !== `Bearer ${expectedToken}`) {
    whatsappLogger.warn(
      {
        token: token ? '***' : 'none',
        expectedTokenLength: expectedToken ? expectedToken.length : 0,
        usingDefaultSecret: expectedToken === 'default-secret',
      },
      'Tentativa de acesso não autorizado ao endpoint de lembretes',
    )
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Token de autenticação inválido ou ausente',
    })
    return false
  }
  return true
}

router.post('/api/reminders/send', async (req: Request, res: Response) => {
  if (!validateReminderToken(req, res, () => {})) {
    return
  }

  try {
    const payload: SendReminderPayload = req.body

    if (!payload.clientPhone || !payload.message || !payload.type) {
      whatsappLogger.warn(
        {
          payload,
        },
        'Payload inválido para envio de lembrete',
      )
      return res.status(400).json({
        error: 'Invalid payload',
        message: 'clientPhone, message e type são obrigatórios',
      })
    }

    whatsappLogger.info(
      {
        appointmentId: payload.appointmentId,
        clientPhone: payload.clientPhone,
        type: payload.type,
      },
      'Recebido pedido para enviar lembrete',
    )

    // Verifica preferências do cliente
    const shouldSend = await ReminderPreferencesService.shouldSendReminder(payload.clientPhone)

    if (!shouldSend) {
      whatsappLogger.info(
        {
          appointmentId: payload.appointmentId,
          clientPhone: payload.clientPhone,
        },
        'Cliente optou por não receber lembretes, pulando envio',
      )

      return res.status(200).json({
        success: true,
        skipped: true,
        reason: 'Cliente optou por não receber lembretes',
        appointmentId: payload.appointmentId,
      })
    }

    // Envia lembrete com retry automático
    const result: ReminderSendResponse = await ReminderSenderService.sendReminder(payload)

    whatsappLogger.info(
      {
        result,
      },
      result.success ? 'Lembrete enviado com sucesso' : 'Falha ao enviar lembrete',
    )

    // Retorna resposta imediatamente (o backend vai trackear o status posteriormente)
    res.status(result.success ? 200 : 500).json(result)
  } catch (error: any) {
    whatsappLogger.error(
      {
        error: error?.message,
        stack: error?.stack,
      },
      'Erro ao processar requisição de lembrete',
    )

    res.status(500).json({
      error: 'Internal server error',
      message: error?.message || 'Erro ao processar requisição de lembrete',
    })
  }
})

/**
 * POST /api/reminders/opt-out
 * Processa comando de opt-out via WhatsApp
 */
router.post('/api/reminders/opt-out', async (req: Request, res: Response) => {
  try {
    const { clientPhone } = req.body

    if (!clientPhone) {
      return res.status(400).json({
        error: 'Invalid payload',
        message: 'clientPhone é obrigatório',
      })
    }

    await ReminderPreferencesService.optOut(clientPhone)

    res.status(200).json({
      success: true,
      message: `Cliente ${clientPhone} optou por não receber lembretes`,
    })
  } catch (error: any) {
    whatsappLogger.error(
      {
        error: error?.message,
      },
      'Erro ao processar opt-out',
    )

    res.status(500).json({
      error: 'Internal server error',
      message: error?.message,
    })
  }
})

/**
 * POST /api/reminders/opt-in
 * Processa comando de opt-in via WhatsApp
 */
router.post('/api/reminders/opt-in', async (req: Request, res: Response) => {
  try {
    const { clientPhone } = req.body

    if (!clientPhone) {
      return res.status(400).json({
        error: 'Invalid payload',
        message: 'clientPhone é obrigatório',
      })
    }

    await ReminderPreferencesService.optIn(clientPhone)

    res.status(200).json({
      success: true,
      message: `Cliente ${clientPhone} voltou a receber lembretes`,
    })
  } catch (error: any) {
    whatsappLogger.error(
      {
        error: error?.message,
      },
      'Erro ao processar opt-in',
    )

    res.status(500).json({
      error: 'Internal server error',
      message: error?.message,
    })
  }
})

/**
 * GET /api/reminders/health
 * Health check do serviço de lembretes
 */
router.get('/api/reminders/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'reminder-handler',
    timestamp: new Date().toISOString(),
  })
})

export { router as reminderRouter }
