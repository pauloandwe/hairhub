import { downloadMedia, sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { getUserContext } from '../../env.config'
import { handleIncomingInteractiveList } from '../../interactives/registry'
import { ensureUserApiToken } from '../auth-token.service'
import { transcribeAudio } from '../openai.service'
import { SimplifiedExpenseContextService } from '../finances/simplifiedExpense/simplifiedExpense.context'
import { DeathContextService } from '../livestocks/Death/death.context'
import { DefaultContextService } from '../defaultContext'
import { BirthContextService } from '../livestocks/Birth/birthService.context'
import { SellingContextService } from '../livestocks/Selling/sellingService.context'
import { AppointmentContextService } from '../appointments/appointmentService.context'
import { AppointmentRescheduleContextService } from '../appointments/appointmentReschedule.context'

export class ContextService {
  private static instance: ContextService
  private readonly simplifiedExpenseContext = SimplifiedExpenseContextService.getInstance()
  private readonly deathContext = DeathContextService.getInstance()
  private readonly defaultContext = DefaultContextService.getInstance()
  private readonly birthContext = BirthContextService.getInstance()
  private readonly sellingContext = SellingContextService.getInstance()
  private readonly appointmentContext = AppointmentContextService.getInstance()
  private readonly appointmentRescheduleContext = AppointmentRescheduleContextService.getInstance()

  private readonly contextMap = {
    [FlowType.SimplifiedExpense]: this.simplifiedExpenseContext,
    [FlowType.Death]: this.deathContext,
    [FlowType.Birth]: this.birthContext,
    [FlowType.Selling]: this.sellingContext,
    [FlowType.Appointment]: this.appointmentContext,
    [FlowType.AppointmentReschedule]: this.appointmentRescheduleContext,
  }

  static getInstance(): ContextService {
    if (!ContextService.instance) {
      ContextService.instance = new ContextService()
    }
    return ContextService.instance
  }

  transformMessage = async (messageData: any): Promise<string | null> => {
    const { from: userId, id: messageId, type: messageType } = messageData
    if (messageType === 'text') {
      return messageData.text?.body
    } else if (messageData.type === 'audio') {
      const mediaId = messageData.audio?.id
      if (!mediaId) return null

      const audioBuffer = await downloadMedia(mediaId)

      return await transcribeAudio(audioBuffer)
    } else if (messageType === 'interactive') {
      const interactive: any = (messageData as any)?.interactive
      const replyId: string | undefined = interactive?.list_reply?.id || interactive?.button_reply?.id

      const handled = await handleIncomingInteractiveList(userId, messageId, replyId)
      if (!handled) {
        console.log('Interactive ignorado ou sem handler para namespace.', replyId)
      }
      return null
    } else {
      return null
    }
  }

  private verifyUserClearance = async (businessId: string, userId: string) => {
    return await ensureUserApiToken(businessId, userId)
  }

  private async handleFlow(activeFlowType: FlowType | undefined, userId: string, incomingMessage: string) {
    let context: SimplifiedExpenseContextService | DeathContextService | DefaultContextService | BirthContextService | SellingContextService | AppointmentContextService | AppointmentRescheduleContextService = this.defaultContext

    if (activeFlowType) {
      context = this.contextMap[activeFlowType as keyof typeof this.contextMap]

      if (!context) {
        await sendWhatsAppMessage(userId, 'Estou com problemas para iniciar o fluxo. Poderia tentar novamente mais tarde por gentileza?')
        console.error(`Context for flow ${activeFlowType} not found`)
        return
      }
    }

    return await context.handleFlowInitiation(userId, incomingMessage)
  }

  handleIncomingMessage = async (messageData: any, businessId?: string) => {
    const { from: userId } = messageData

    await getUserContext(userId)

    const currentContext = await getUserContext(userId)
    const activeRegistration = currentContext?.activeRegistration
    const isRegistrationCompleted = activeRegistration?.status === 'completed'
    const activeFlowType = isRegistrationCompleted ? undefined : (activeRegistration?.type as FlowType | undefined)
    try {
      const incomingMessage = await this.transformMessage(messageData)

      if (!incomingMessage) return

      if (!businessId) {
        return await sendWhatsAppMessage(userId, 'Não consegui identificar o estabelecimento. Tente novamente em instantes.')
      }

      const hasClearance = await this.verifyUserClearance(businessId, userId)

      if (!hasClearance) {
        return await sendWhatsAppMessage(userId, 'Não consegui autenticar sua sessão no momento. Tente novamente em instantes.')
      }

      await this.handleFlow(activeFlowType, userId, incomingMessage)
    } catch (error) {
      console.error('[ContextService] Erro ao processar mensagem:', error)
      try {
        await sendWhatsAppMessage(userId, 'Ops, algo deu errado ao processar sua solicitação. Nossa equipe foi notificada. Tente novamente em instantes.')
      } catch (sendError) {
        console.error('[ContextService] Erro ao enviar mensagem de erro:', sendError)
      }
      throw error
    }
  }
}
