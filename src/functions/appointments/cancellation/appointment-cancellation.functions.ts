import { FlowType } from '../../../enums/generic.enum'
import { GenericCrudFlow } from '../../generic/generic.flow'
import { AppointmentCancellationDraft, AppointmentCancellationField, AppointmentCancellationCreationPayload, AppointmentCancellationRecord, UpsertAppointmentCancellationArgs, appointmentCancellationDraftService } from '../../../services/appointments/appointment-cancellation-draft.service'
import { appointmentCancellationFieldEditors, appointmentCancellationMissingFieldHandlers } from './appointment-cancellation.selects'
import { sendConfirmationButtons } from '../../../interactives/genericConfirmation'
import { appendUserTextAuto } from '../../../services/history-router.service'
import { appointmentCancellationService } from '../../../services/appointments/appointment-cancellation.service'
import { customerAppointmentsService } from '../../../services/appointments/customer-appointments.service'
import { sendWhatsAppMessage } from '../../../api/meta.api'

type AppointmentCancellationEditField = `${AppointmentCancellationField}`

class AppointmentCancellationFlowService extends GenericCrudFlow<AppointmentCancellationDraft, AppointmentCancellationCreationPayload, AppointmentCancellationRecord, UpsertAppointmentCancellationArgs, AppointmentCancellationEditField, AppointmentCancellationField> {
  private readonly confirmationNamespace = 'APPOINTMENT_CANCELLATION_CONFIRMATION'

  constructor() {
    super({
      service: appointmentCancellationDraftService,
      flowType: FlowType.AppointmentCancellation,
      fieldEditors: appointmentCancellationFieldEditors,
      missingFieldHandlers: appointmentCancellationMissingFieldHandlers,
      messages: {
        confirmation: 'Confirma o cancelamento desse horário?',
        creationSuccess: 'Agendamento cancelado com sucesso!',
        creationResponse: 'Tudo certo, agendamento cancelado.',
        cancelSent: 'Beleza, cancelamento interrompido.',
        cancelResponse: 'Operação cancelada.',
        missingDataDuringConfirm: 'Falta escolher qual agendamento será cancelado.',
        invalidField: 'Esse campo não pode ser alterado por aqui.',
        editModeIntro: 'Me diga qual agendamento você quer cancelar.',
        editModeExamples: ['"Cancelar o horário de amanhã"', '"Escolher outro agendamento"'],
        editRecordNotFound: 'Não achei o agendamento para cancelar.',
        editFieldUpdateError: 'Não consegui alterar o agendamento selecionado.',
        editPromptFallback: 'Qual agendamento você quer cancelar?',
        editDirectChangeSuccess: 'Seleção atualizada.',
        editUpdateSuccess: 'Seleção atualizada.',
        editUpdateError: 'Erro ao atualizar a seleção. Tenta de novo?',
        deleteRecordNotFound: 'Não achei o agendamento para cancelar.',
        deleteSuccess: 'Agendamento cancelado com sucesso!',
        deleteError: 'Erro ao cancelar o agendamento. Tenta de novo?',
        buttonHeaderSuccess: 'Cancelamento pronto',
        useNaturalLanguage: false,
      },
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
      const message = error instanceof Error ? error.message : 'Não consegui iniciar o cancelamento agora.'
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
      message: 'Deseja mesmo cancelar esse horário?',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Voltar',
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
    await sendWhatsAppMessage(phone, 'Tudo certo, horário cancelado.')
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
