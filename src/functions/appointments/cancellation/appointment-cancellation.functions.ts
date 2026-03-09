import { FlowType } from '../../../enums/generic.enum'
import { GenericCrudFlow } from '../../generic/generic.flow'
import { AppointmentCancellationDraft, AppointmentCancellationField, AppointmentCancellationCreationPayload, AppointmentCancellationRecord, UpsertAppointmentCancellationArgs, appointmentCancellationDraftService } from '../../../services/appointments/appointment-cancellation-draft.service'
import { appointmentCancellationFieldEditors, appointmentCancellationMissingFieldHandlers } from './appointment-cancellation.selects'
import { sendConfirmationButtons } from '../../../interactives/genericConfirmation'
import { appendUserTextAuto } from '../../../services/history-router.service'
import { appointmentCancellationService } from '../../../services/appointments/appointment-cancellation.service'
import { customerAppointmentsService } from '../../../services/appointments/customer-appointments.service'
import { sendWhatsAppMessage } from '../../../api/meta.api'
import { createHumanFlowMessages } from '../../../utils/conversation-copy'

type AppointmentCancellationEditField = `${AppointmentCancellationField}`

class AppointmentCancellationFlowService extends GenericCrudFlow<AppointmentCancellationDraft, AppointmentCancellationCreationPayload, AppointmentCancellationRecord, UpsertAppointmentCancellationArgs, AppointmentCancellationEditField, AppointmentCancellationField> {
  private readonly confirmationNamespace = 'APPOINTMENT_CANCELLATION_CONFIRMATION'

  constructor() {
    super({
      service: appointmentCancellationDraftService,
      flowType: FlowType.AppointmentCancellation,
      fieldEditors: appointmentCancellationFieldEditors,
      missingFieldHandlers: appointmentCancellationMissingFieldHandlers,
      messages: createHumanFlowMessages({
        confirmation: 'Se estiver tudo certo, posso cancelar esse horario?',
        creationSuccess: 'Pronto, esse horario foi cancelado.',
        creationResponse: 'Tudo certo, ja deixei esse cancelamento feito.',
        cancelSent: 'Tudo bem, nao cancelei nada por aqui.',
        cancelResponse: 'Certo, parei esse cancelamento.',
        missingDataDuringConfirm: 'Me mostra primeiro qual horario voce quer cancelar.',
        invalidField: 'Esse item eu nao consigo mudar por aqui.',
        editModeIntro: 'Me fala qual horario voce quer cancelar.',
        editModeExamples: ['"Cancelar o horario de amanha"', '"Escolher outro agendamento"'],
        editRecordNotFound: 'Nao achei esse agendamento para cancelar.',
        editFieldUpdateError: 'Nao consegui trocar o horario selecionado agora.',
        editPromptFallback: 'Qual horario voce quer cancelar?',
        editDirectChangeSuccess: 'Perfeito, atualizei a selecao.',
        editUpdateSuccess: 'Perfeito, atualizei a selecao.',
        editUpdateError: 'Nao consegui atualizar essa selecao agora. Tenta de novo?',
        deleteRecordNotFound: 'Nao achei esse agendamento para cancelar.',
        deleteSuccess: 'Pronto, esse horario foi cancelado.',
        deleteError: 'Nao consegui cancelar esse horario agora. Tenta de novo?',
        buttonHeaderSuccess: 'Cancelamento pronto',
        useNaturalLanguage: false,
      }),
      accessControl: {
        deniedMessage: 'Esse plano ainda não tem essa funcionalidade.',
      },
    })
  }

  startAppointmentCancellation = async (args: { phone: string; appointmentId?: number | null }) => {
    const { phone, appointmentId } = args

    try {
      await customerAppointmentsService.ensureActionEnabled(phone, 'cancellation')

      if (appointmentId) {
        try {
          const appointments = await appointmentCancellationService.fetchCancelableAppointments(phone)
          const selectedAppointment = appointments.find((appointment) => appointment.id === appointmentId)

          if (selectedAppointment) {
            await this.setFlowContext(phone)
            await appointmentCancellationService.selectAppointment(phone, appointmentId)
            const draft = await appointmentCancellationDraftService.updateDraft(phone, { appointmentId })
            const hydratedDraft = await appointmentCancellationDraftService.hydrateSelectedAppointment(phone, draft)
            return this.presentConfirmation(phone, hydratedDraft)
          }
        } catch (error) {
          console.error('[AppointmentCancellationFlow] Error preselecting appointment for cancellation:', error)
        }
      }

      return super.startRegistration({ phone })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao consegui abrir esse cancelamento agora.'
      await sendWhatsAppMessage(phone, message)
      return this.buildResponse(message, false)
    }
  }

  changeAppointmentCancellationField = async (args: { phone: string; field: AppointmentCancellationEditField; value?: any }) => {
    const logContext = args.value !== undefined ? `Campo ${args.field} atualizado com valor ${JSON.stringify(args.value)}` : undefined
    return this.changeRegistrationWithValue({
      ...args,
      logContext,
    })
  }

  continueAppointmentCancellation = async (args: { phone: string }) => {
    return super.continueRegistration(args)
  }

  confirmAppointmentCancellation = async (args: { phone: string }) => {
    const draft = await appointmentCancellationDraftService.hydrateSelectedAppointment(args.phone)
    if (draft.selectedAppointment) {
      await customerAppointmentsService.validateAppointmentAction(args.phone, 'cancellation', draft.selectedAppointment)
    }

    return super.confirmRegistration(args)
  }

  cancelAppointmentCancellation = async (args: { phone: string }) => {
    await appointmentCancellationService.clear(args.phone)
    return super.cancelRegistration(args)
  }

  protected async beforeConfirmation(phone: string, draft: AppointmentCancellationDraft): Promise<void> {
    const hydratedDraft = await appointmentCancellationDraftService.hydrateSelectedAppointment(phone, draft)
    if (hydratedDraft.selectedAppointment) {
      await customerAppointmentsService.validateAppointmentAction(phone, 'cancellation', hydratedDraft.selectedAppointment)
    }
  }

  protected async prepareDraftForConfirmation(phone: string, draft: AppointmentCancellationDraft): Promise<void> {
    await appointmentCancellationDraftService.hydrateSelectedAppointment(phone, draft)
    await appointmentCancellationDraftService.saveDraft(phone, draft)
  }

  protected async sendConfirmation(phone: string, _draft: AppointmentCancellationDraft, summary: string): Promise<void> {
    await sendConfirmationButtons({
      namespace: this.confirmationNamespace,
      userId: phone,
      message: 'Se estiver tudo certo, eu cancelo esse horario para voce.',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Agora nao',
      summaryText: summary,
      onConfirm: async (userId) => {
        await appendUserTextAuto(userId, 'Confirmar cancelamento')
        await this.confirmAppointmentCancellation({ phone: userId })
      },
      onCancel: async (userId) => {
        await appendUserTextAuto(userId, 'Voltar')
        await this.cancelAppointmentCancellation({ phone: userId })
      },
      loadDraft: appointmentCancellationDraftService.loadDraft,
    })
  }

  protected async sendEditDeleteOptions(phone: string): Promise<void> {
    await sendWhatsAppMessage(phone, 'Pronto, esse horario ja foi cancelado.')
  }

  protected async sendEditDeleteOptionsAfterError(): Promise<void> {}

  protected async sendEditCancelOptionsAfterCreationError(): Promise<void> {}

  protected async onAfterCreateSuccess(phone: string): Promise<void> {
    await appointmentCancellationService.clear(phone)
  }

  protected async onCancel(phone: string): Promise<void> {
    await appointmentCancellationService.clear(phone)
  }
}

export const appointmentCancellationFunctions = new AppointmentCancellationFlowService()
