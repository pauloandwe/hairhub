import { FlowType } from '../../enums/generic.enum'
import { getUserContext } from '../../env.config'
import { DefaultContextService } from '../defaultContext'
import { AppointmentContextService } from '../appointments/create/appointmentContext.service'
import { downloadMedia, sendWhatsAppMessage } from '../../api/meta.api'
import { trackIntentChange } from '../intent-tracker.service'
import { transcribeAudio } from '../openai.service'
import { handleIncomingInteractiveList } from '../../interactives/registry'

export class ContextService {
  private static instance: ContextService
  private readonly defaultContext = DefaultContextService.getInstance()
  private readonly appointmentContext = AppointmentContextService.getInstance()

  private readonly contextMap = {
    [FlowType.AppointmentCreate]: this.appointmentContext,
    [FlowType.AppointmentReschedule]: this.defaultContext,
    [FlowType.AppointmentCancel]: this.defaultContext,
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

  async getContextService(phone: string) {
    const userContext = await getUserContext(phone)
    const activeFlowType = userContext?.activeFlow?.type

    if (activeFlowType && this.contextMap[activeFlowType as FlowType]) {
      return this.contextMap[activeFlowType as FlowType]
    }

    return this.defaultContext
  }

  private async handleFlow(activeFlowType: FlowType | undefined, userId: string, incomingMessage: string) {
    let context: DefaultContextService | AppointmentContextService = this.defaultContext
    const currentIntent = activeFlowType || 'default'

    await trackIntentChange(userId, currentIntent)

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

  handleIncomingMessage = async (messageData: any) => {
    const { from: userId } = messageData

    await getUserContext(userId)

    const currentContext = await getUserContext(userId)
    const activeRegistration = currentContext?.activeRegistration
    const isRegistrationCompleted = activeRegistration?.status === 'completed'
    const activeFlowType = isRegistrationCompleted ? undefined : (activeRegistration?.type as FlowType | undefined)
    try {
      const incomingMessage = await this.transformMessage(messageData)

      if (!incomingMessage) return

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
