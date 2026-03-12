import { downloadMedia, sendWhatsAppMessage, sendWhatsAppMessageWithTitle } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { ClientNameCaptureState, getBusinessPhoneForPhone, getUserContext, resetActiveRegistration, setUserContext } from '../../env.config'
import { handleIncomingInteractiveList } from '../../interactives/registry'
import { ensureUserApiToken } from '../auth-token.service'
import { clientsService } from '../clients/clients.service'
import { clientNameCaptureService } from '../clients/client-name-capture.service'
import { transcribeAudio } from '../openai.service'
import { getOutreachContext, clearOutreachContext } from '../outreach/outreach-context.service'
import { SimplifiedExpenseContextService } from '../finances/simplifiedExpense/simplifiedExpense.context'
import { DeathContextService } from '../livestocks/Death/death.context'
import { DefaultContextService } from '../defaultContext'
import { BirthContextService } from '../livestocks/Birth/birthService.context'
import { SellingContextService } from '../livestocks/Selling/sellingService.context'
import { AppointmentContextService } from '../appointments/appointmentService.context'
import { AppointmentCancellationContextService } from '../appointments/appointmentCancellation.context'
import { AppointmentRescheduleContextService } from '../appointments/appointmentReschedule.context'
import { appointmentIntentService } from '../appointments/appointment-intent.service'
import { appointmentFunctions } from '../../functions/appointments/appointment.functions'
import { sendAppointmentAvailabilityResolutionList } from '../../interactives/appointments/availabilityResolutionSelection'
import { registerPanelClientQuickActionHandler } from '../../interactives/clientQuickActions'

export class ContextService {
  private static instance: ContextService
  private readonly simplifiedExpenseContext = SimplifiedExpenseContextService.getInstance()
  private readonly deathContext = DeathContextService.getInstance()
  private readonly defaultContext = DefaultContextService.getInstance()
  private readonly birthContext = BirthContextService.getInstance()
  private readonly sellingContext = SellingContextService.getInstance()
  private readonly appointmentContext = AppointmentContextService.getInstance()
  private readonly appointmentCancellationContext = AppointmentCancellationContextService.getInstance()
  private readonly appointmentRescheduleContext = AppointmentRescheduleContextService.getInstance()
  private readonly clientNameCapture = clientNameCaptureService

  private readonly contextMap = {
    [FlowType.SimplifiedExpense]: this.simplifiedExpenseContext,
    [FlowType.Death]: this.deathContext,
    [FlowType.Birth]: this.birthContext,
    [FlowType.Selling]: this.sellingContext,
    [FlowType.Appointment]: this.appointmentContext,
    [FlowType.AppointmentCancellation]: this.appointmentCancellationContext,
    [FlowType.AppointmentReschedule]: this.appointmentRescheduleContext,
  }

  private constructor() {
    registerPanelClientQuickActionHandler()
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

  private verifyUserClearance = async (businessPhone: string, userId: string) => {
    return await ensureUserApiToken(businessPhone, userId)
  }

  private buildAwaitingFirstClientNameCaptureState(): ClientNameCaptureState {
    return {
      phase: 'AWAITING_FIRST',
      firstMessageText: null,
      waitingStartedAt: null,
      waitingDeadlineAt: null,
    }
  }

  private buildAwaitingSecondClientNameCaptureState(firstMessageText: string): ClientNameCaptureState {
    const now = new Date()
    return {
      phase: 'AWAITING_SECOND',
      firstMessageText,
      waitingStartedAt: now.toISOString(),
      waitingDeadlineAt: new Date(now.getTime() + this.clientNameCapture.getWaitWindowMs()).toISOString(),
    }
  }

  private normalizeCapturedClientName(rawValue?: string | null): string | null {
    if (typeof rawValue !== 'string') {
      return null
    }

    const normalized = rawValue.replace(/\s+/g, ' ').trim()
    if (!normalized || /\d/.test(normalized)) {
      return null
    }

    const usefulCharacters = normalized.replace(/[\s'-]/g, '')
    if (usefulCharacters.length < 2) {
      return null
    }

    return normalized
  }

  private async resetClientNameCaptureToFirstStep(userId: string): Promise<void> {
    this.clientNameCapture.clearPendingSecondMessageTimer(userId)
    await setUserContext(userId, {
      awaitingClientName: true,
      clientNameCapture: this.buildAwaitingFirstClientNameCaptureState(),
    })
  }

  private async promptInitialClientName(userId: string): Promise<void> {
    await this.resetClientNameCaptureToFirstStep(userId)
    await sendWhatsAppMessageWithTitle(userId, 'Antes de continuar, me fala seu nome rapidinho pra eu te atender melhor 😊')
  }

  private async promptClientNameAgain(userId: string): Promise<void> {
    await this.resetClientNameCaptureToFirstStep(userId)
    await sendWhatsAppMessage(userId, 'Me manda só seu nome rapidinho que eu já continuo por aqui 😊')
  }

  private scheduleClientNameSecondMessageTimeout(userId: string): void {
    this.clientNameCapture.schedulePendingSecondMessageTimer(userId, async () => {
      const latestContext = await getUserContext(userId)
      if (!latestContext?.awaitingClientName) {
        return
      }

      if (latestContext.clientNameCapture?.phase !== 'AWAITING_SECOND') {
        return
      }

      await this.promptClientNameAgain(userId)
    })
  }

  private async saveResolvedClientName(businessPhone: string, userId: string, clientName: string): Promise<void> {
    const currentContext = await getUserContext(userId)

    let resolvedBusinessId = currentContext?.businessId ? String(currentContext.businessId).trim() : ''
    if (!resolvedBusinessId) {
      const clearance = await this.verifyUserClearance(businessPhone, userId)
      resolvedBusinessId = clearance?.id ? String(clearance.id).trim() : ''
      if (!clearance) {
        await sendWhatsAppMessage(userId, 'Não consegui autenticar sua sessão no momento. Tente novamente em instantes.')
        return
      }
    }

    if (!resolvedBusinessId) {
      console.error('[ContextService] Missing business identifier when saving client name.', {
        businessPhone,
        contextBusinessId: currentContext?.businessId,
      })
      await sendWhatsAppMessage(userId, 'Desculpe, não consegui identificar o estabelecimento. Tente novamente em instantes.')
      return
    }

    const savedClient = await clientsService.createOrUpdateClientName(String(resolvedBusinessId), userId, clientName)
    const confirmedName = this.normalizeCapturedClientName(savedClient.name ?? clientName) ?? clientName

    this.clientNameCapture.clearPendingSecondMessageTimer(userId)
    await resetActiveRegistration(userId)
    await setUserContext(userId, {
      clientName: confirmedName,
      awaitingClientName: false,
      clientNameCapture: null,
    })

    await sendWhatsAppMessage(userId, `Ótimo, ${confirmedName}! Seu nome foi registrado. Como posso te ajudar hoje?`)
  }

  private handleClientNameCollection = async (businessPhone: string, userId: string, incomingMessage: string): Promise<void> => {
    const currentContext = await getUserContext(userId)
    const awaitingClientName = currentContext?.awaitingClientName

    if (!awaitingClientName) {
      return
    }

    try {
      const cleanedIncomingMessage = incomingMessage.replace(/\s+/g, ' ').trim()
      if (!cleanedIncomingMessage) {
        await this.promptClientNameAgain(userId)
        return
      }

      const captureState = currentContext?.clientNameCapture ?? this.buildAwaitingFirstClientNameCaptureState()

      if (captureState.phase === 'AWAITING_SECOND') {
        this.clientNameCapture.clearPendingSecondMessageTimer(userId)

        const extractedFromTwoMessages = await this.clientNameCapture.extractName([captureState.firstMessageText ?? '', cleanedIncomingMessage])
        const resolvedName = this.normalizeCapturedClientName(extractedFromTwoMessages)

        if (resolvedName) {
          await this.saveResolvedClientName(businessPhone, userId, resolvedName)
          return
        }

        await this.promptClientNameAgain(userId)
        return
      }

      const extractedFromSingleMessage = await this.clientNameCapture.extractName([cleanedIncomingMessage])
      const resolvedName = this.normalizeCapturedClientName(extractedFromSingleMessage)

      if (resolvedName) {
        await this.saveResolvedClientName(businessPhone, userId, resolvedName)
        return
      }

      await setUserContext(userId, {
        awaitingClientName: true,
        clientNameCapture: this.buildAwaitingSecondClientNameCaptureState(cleanedIncomingMessage),
      })
      this.scheduleClientNameSecondMessageTimeout(userId)
    } catch (error) {
      console.error('[ContextService] Error saving client name:', error)
      await sendWhatsAppMessage(userId, 'Desculpe, ocorreu um erro ao registrar seu nome. Tente novamente em instantes.')
    }
  }

  private async handleFlow(activeFlowType: FlowType | undefined, userId: string, incomingMessage: string) {
    let context: SimplifiedExpenseContextService | DeathContextService | DefaultContextService | BirthContextService | SellingContextService | AppointmentContextService | AppointmentCancellationContextService | AppointmentRescheduleContextService = this.defaultContext

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

  private handlePendingAppointmentIntent = async (userId: string, incomingMessage: string): Promise<boolean> => {
    await appointmentIntentService.cleanupExpiredState(userId)

    const pendingOfferReply = await appointmentIntentService.consumePendingOfferReply(userId, incomingMessage)
    if (pendingOfferReply.handled) {
      if (pendingOfferReply.action === 'accept' && pendingOfferReply.offer) {
        await appointmentFunctions.acceptPendingOffer(userId, pendingOfferReply.offer)
      } else if (pendingOfferReply.action === 'decline') {
        await appointmentIntentService.notifyOfferDeclined(userId)
      }
      return true
    }

    const pendingResolutionReply = await appointmentIntentService.consumePendingResolutionReply(userId, incomingMessage)
    if (pendingResolutionReply.handled) {
      if (pendingResolutionReply.action === 'selected') {
        await appointmentFunctions.startAppointmentRegistration({
          phone: userId,
          ...pendingResolutionReply.request,
          intentMode: 'check_then_offer',
        })
      } else if (pendingResolutionReply.action === 'retry') {
        await sendAppointmentAvailabilityResolutionList(userId)
      } else if (pendingResolutionReply.action === 'decline') {
        await sendWhatsAppMessage(userId, 'Tudo bem. Quando quiser, me fala o horario que voce quer verificar.')
      }
      return true
    }

    return false
  }

  handleIncomingMessage = async (messageData: any, businessPhone?: string, phoneNumberId?: string) => {
    const { from: userId } = messageData

    let runtimeContext = await getUserContext(userId)
    const activeRegistration = runtimeContext?.activeRegistration
    const isRegistrationCompleted = activeRegistration?.status === 'completed'
    const activeFlowType = isRegistrationCompleted ? undefined : (activeRegistration?.type as FlowType | undefined)
    try {
      const incomingMessage = await this.transformMessage(messageData)

      if (!incomingMessage) return

      const resolvedBusinessPhone = String(businessPhone || runtimeContext?.businessPhone || getBusinessPhoneForPhone(userId) || '').trim()
      const resolvedPhoneNumberId = String(phoneNumberId || runtimeContext?.phoneNumberId || '').trim()

      if (!resolvedBusinessPhone) {
        return await sendWhatsAppMessage(userId, 'Não consegui identificar o estabelecimento. Tente novamente em instantes.')
      }

      if (resolvedBusinessPhone || resolvedPhoneNumberId) {
        await setUserContext(userId, {
          businessPhone: resolvedBusinessPhone || undefined,
          phoneNumberId: resolvedPhoneNumberId || undefined,
        })
      }

      const hasClearance = await this.verifyUserClearance(resolvedBusinessPhone, userId)

      if (!hasClearance) {
        return await sendWhatsAppMessage(userId, 'Não consegui autenticar sua sessão no momento. Tente novamente em instantes.')
      }

      runtimeContext = await getUserContext(userId)

      const outreachContext = await getOutreachContext(userId)
      if (outreachContext) {
        await clearOutreachContext(userId)

        await setUserContext(userId, {
          outreachReply: {
            type: outreachContext.type,
            businessName: outreachContext.businessName,
            clientName: outreachContext.clientName,
            sentAt: outreachContext.sentAt,
            message: outreachContext.message,
            metadata: outreachContext.metadata,
          },
          businessId: outreachContext.businessId,
          businessPhone: outreachContext.businessPhone,
          businessName: outreachContext.businessName,
        })

        runtimeContext = await getUserContext(userId)
      }

      let resolvedClientName = runtimeContext?.clientName ?? hasClearance.clientName ?? null

      if (resolvedClientName !== null && runtimeContext?.awaitingClientName) {
        this.clientNameCapture.clearPendingSecondMessageTimer(userId)
        await setUserContext(userId, {
          clientName: resolvedClientName,
          awaitingClientName: false,
          clientNameCapture: null,
        })
        runtimeContext = await getUserContext(userId)
      }

      if (runtimeContext?.awaitingClientName) {
        await this.handleClientNameCollection(resolvedBusinessPhone, userId, incomingMessage)
        return
      }

      resolvedClientName = runtimeContext?.clientName ?? hasClearance.clientName ?? null

      if (resolvedClientName === null && !runtimeContext?.awaitingClientName) {
        await this.promptInitialClientName(userId)
        return
      }

      if (await this.handlePendingAppointmentIntent(userId, incomingMessage)) {
        return
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
