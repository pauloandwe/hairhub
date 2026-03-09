import { log } from 'console'
import { FlowType } from '../../../enums/generic.enum'
import { Plan, SubPlan } from '../../../enums/plans.enums'
import { GenericCrudFlow } from '../../generic/generic.flow'
import { RescheduleField, RescheduleDraft, RescheduleCreationPayload, RescheduleRecord, UpsertRescheduleArgs, appointmentRescheduleDraftService } from '../../../services/appointments/appointment-reschedule-draft.service'
import { sendEditCancelButtonsAfterCreationError } from '../../../interactives/genericConfirmation'
import { appendUserTextAuto, appendAssistantTextAuto } from '../../../services/history-router.service'
import { rescheduleFieldEditors, missingFieldHandlers } from './appointment-reschedule.selects'
import { sendWhatsAppMessage } from '../../../api/meta.api'
import { customerAppointmentsService } from '../../../services/appointments/customer-appointments.service'
import { DateFormatter } from '../../../utils/date'
import { createHumanFlowMessages } from '../../../utils/conversation-copy'

type RescheduleEditField = `${RescheduleField}`

class AppointmentRescheduleFlowService extends GenericCrudFlow<RescheduleDraft, RescheduleCreationPayload, RescheduleRecord, UpsertRescheduleArgs, RescheduleEditField, RescheduleField> {
  private readonly editDeleteErrorNamespace = 'APPOINTMENT_RESCHEDULE_EDIT_DELETE_ERROR'
  private readonly editCancelCreationErrorNamespace = 'APPOINTMENT_RESCHEDULE_EDIT_CANCEL_CREATION_ERROR'

  constructor() {
    super({
      service: appointmentRescheduleDraftService,
      flowType: FlowType.AppointmentReschedule,
      fieldEditors: rescheduleFieldEditors,
      missingFieldHandlers,
      messages: createHumanFlowMessages({
        confirmation: 'Se estiver tudo certo, posso confirmar essa remarcacao?',
        creationSuccess: 'Pronto, seu horario foi remarcado.',
        creationResponse: 'Perfeito, ja ajustei sua remarcacao por aqui.',
        cancelSent: 'Tudo bem, parei a remarcacao por aqui.',
        cancelResponse: 'Certo, nao segui com a remarcacao.',
        missingDataDuringConfirm: 'Ainda falta um detalhe para remarcar. Vou te pedir agora.',
        editModeIntro: 'Claro. Me fala o que voce quer ajustar nessa remarcacao.',
        editModeExamples: ['"Mudar a data"', '"Trocar o horario"'],
        editRecordNotFound: 'Nao achei essa remarcacao por aqui.',
        editUpdateSuccess: 'Pronto, ajustei a remarcacao.',
        deleteRecordNotFound: 'Nao achei essa remarcacao para continuar.',
        deleteSuccess: 'Pronto, essa remarcacao foi removida.',
        deleteError: 'Nao consegui remover essa remarcacao agora. Tenta de novo?',
        buttonHeaderSuccess: 'Remarcacao pronta',
        useNaturalLanguage: false,
      }),
      accessControl: {
        deniedMessage: 'Esse plano ainda não tem essa funcionalidade.',
      },
    })
  }

  startAppointmentReschedule = async (args: { phone: string }) => {
    try {
      await customerAppointmentsService.ensureActionEnabled(args.phone, 'reschedule')
      return super.startRegistration(args)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não consegui iniciar a remarcação agora.'
      await sendWhatsAppMessage(args.phone, message)
      return this.buildResponse(message, false)
    }
  }

  changeAppointmentRescheduleField = async (args: { phone: string; field: RescheduleEditField; value?: any }) => {
    const logContext = args.value !== undefined ? `Campo ${args.field} atualizado com valor ${JSON.stringify(args.value)}` : undefined
    return this.changeRegistrationWithValue({
      ...args,
      logContext,
    })
  }

  confirmAppointmentReschedule = async (args: { phone: string }) => {
    return super.confirmRegistration(args)
  }

  cancelAppointmentReschedule = async (args: { phone: string }) => {
    return super.cancelRegistration(args)
  }

  editAppointmentRescheduleField = async (args: { phone: string; field: string; value?: any }) => {
    return this.editRecordField({
      ...args,
      promptMessage: this.options.messages.editPromptFallback,
    })
  }

  applyRescheduleRecordUpdates = async (args: { phone: string; updates: Partial<UpsertRescheduleArgs>; successMessage?: string; logContext?: string }) => {
    return this.applyRecordUpdates(args)
  }

  async clearSession(args: { phone: string; reason?: string }) {
    const { phone, reason } = args || ({} as any)
    if (!phone) return

    const cleanupReason = reason ?? 'limpeza manual'
    await this.resetFlowSession(phone, cleanupReason)
    log(`[AppointmentRescheduleFlow] Sessão de remarcação limpa. Motivo: ${cleanupReason}. (userId: ${phone})`)
  }

  protected async onFirstStart(phone: string, _draft: RescheduleDraft): Promise<void> {
    void _draft
    log(`[AppointmentRescheduleFlow] O Usuário iniciou uma remarcação. (userId: ${phone})`)
  }

  protected async beforeConfirmation(phone: string, draft: RescheduleDraft): Promise<void> {
    void phone
    void draft
    log(`[AppointmentRescheduleFlow] O usuário está prestes a confirmar a remarcação. (userId: ${phone})`)
  }

  protected async prepareDraftForConfirmation(phone: string, draft: RescheduleDraft): Promise<void> {
    await appointmentRescheduleDraftService.hydrateSelectedAppointment(phone, draft)
    await appointmentRescheduleDraftService.saveDraft(phone, draft)
  }

  protected async sendConfirmation(phone: string, draft: RescheduleDraft, summary: string): Promise<void> {
    await sendWhatsAppMessage(phone, summary)
    await sendWhatsAppMessage(phone, 'Se estiver tudo certo, eu sigo com essa remarcacao.')
  }

  protected async sendEditDeleteOptions(phone: string, _draft: RescheduleDraft, summary: string, _recordId: string): Promise<void> {
    void _draft
    void _recordId
    await sendWhatsAppMessage(phone, summary)
  }

  protected async sendEditDeleteOptionsAfterError(phone: string, _draft: RescheduleDraft, summary: string, _recordId: string, errorMessage: string): Promise<void> {
    void _draft
    void _recordId
    await sendWhatsAppMessage(phone, errorMessage)
    await sendWhatsAppMessage(phone, summary)
  }

  protected async sendEditCancelOptionsAfterCreationError(phone: string, _draft: RescheduleDraft, summary: string, errorMessage: string, recordId: string | null): Promise<void> {
    await sendEditCancelButtonsAfterCreationError({
      namespace: `${this.editCancelCreationErrorNamespace}_${Date.now()}`,
      userId: phone,
      message: 'O que voce quer fazer agora?',
      editLabel: 'Editar',
      cancelLabel: 'Parar por aqui',
      summaryText: summary,
      header: this.options.messages.buttonHeaderEdit || 'Ops!',
      errorMessage,
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar dados')
        if (recordId) {
          await this.promptForDraftEdit(userId)
        } else {
          await this.promptForDraftCorrection(userId)
        }
      },
      onCancel: async (userId) => {
        await appendUserTextAuto(userId, 'Cancelar remarcação')
        await this.cancelRegistration({ phone: userId })
      },
    })
  }

  editAppointmentReschedule = async (args: { phone: string }) => {
    return this.enterEditMode(args)
  }

  deleteAppointmentReschedule = async (args: { phone: string }) => {
    return this.deleteRecord(args)
  }

  protected async onAfterCreateSuccess(phone: string, draft: RescheduleDraft, summary: string): Promise<void> {
    const description = draft.selectedAppointment ? `${draft.selectedAppointment.serviceName || ''} com ${draft.selectedAppointment.professionalName || ''}` : 'agendamento'

    const when = draft.newDate && draft.newTime ? DateFormatter.formatToDateTimeLabel(`${draft.newDate}T${draft.newTime}`) : ''

    const message = `Remarquei ${description}${when ? ` para ${when}` : ''}.`
    await appendAssistantTextAuto(phone, message)
    log(`[AppointmentRescheduleFlow] O Usuário finalizou a remarcação. (userId: ${phone})`)
  }

  protected override async afterEnterEditMode(phone: string, recordId: string, _draft: RescheduleDraft | null): Promise<void> {
    void _draft
    log(`[AppointmentRescheduleFlow] O Usuário entrou em modo de edição da remarcação ${recordId}. (userId: ${phone})`)
  }

  protected override async afterEditSuccess(phone: string, recordId: string, _updates: Partial<UpsertRescheduleArgs>, logContext?: string): Promise<void> {
    void _updates
    log(`[AppointmentRescheduleFlow] ${logContext ?? 'Remarcação atualizada via edição.'} (remarcação ${recordId}, userId: ${phone})`)
  }

  protected override async onEditFailure(phone: string, recordId: string | null, error: unknown, logContext?: string): Promise<void> {
    const contextMessage = logContext ?? 'Erro ao atualizar remarcação em modo edição.'
    log(`[AppointmentRescheduleFlow] ${contextMessage} (remarcação ${recordId ?? 'desconhecida'}, userId: ${phone})`, error)
  }

  protected override async afterDeleteSuccess(phone: string, recordId: string): Promise<void> {
    log(`[AppointmentRescheduleFlow] O Usuário excluiu a remarcação ${recordId}. (userId: ${phone})`)
  }

  protected override async onDeleteCleanupError(phone: string, recordId: string, step: 'clearDraft' | 'clearIntents', error: unknown): Promise<void> {
    const baseMessage = step === 'clearDraft' ? 'Erro ao limpar rascunho após exclusão.' : 'Erro ao limpar históricos após exclusão.'
    console.error(`[AppointmentRescheduleFlow] ${baseMessage} (userId: ${phone})`, error)
  }

  protected override async onDeleteFailure(phone: string, recordId: string | null, error: unknown): Promise<void> {
    log(`[AppointmentRescheduleFlow] Erro ao excluir remarcação ${recordId ?? 'desconhecida'}. (userId: ${phone})`, error)
  }

  protected async onCreateError(phone: string, draft: RescheduleDraft, error: unknown, userMessage: string): Promise<void> {
    await super.onCreateError(phone, draft, error, userMessage)

    void draft
    void userMessage
    log(`[AppointmentRescheduleFlow] Ocorreu um erro ao remarcar. (userId: ${phone})`, error)
  }

  protected async onCancel(phone: string): Promise<void> {
    log(`[AppointmentRescheduleFlow] O Usuário cancelou a remarcação. (userId: ${phone})`)
  }
}

export const appointmentRescheduleFunctions = new AppointmentRescheduleFlowService()
