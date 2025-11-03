import { log } from 'console'
import { FlowType } from '../../../enums/generic.enum'
import { Plan, SubPlan } from '../../../enums/plans.enums'
import { GenericCrudFlow } from '../../generic/generic.flow'
import { RescheduleField, RescheduleDraft, RescheduleCreationPayload, RescheduleRecord, UpsertRescheduleArgs, appointmentRescheduleDraftService } from '../../../services/appointments/appointment-reschedule-draft.service'
import { sendEditCancelButtonsAfterCreationError } from '../../../interactives/genericConfirmation'
import { appendUserTextAuto, appendAssistantTextAuto } from '../../../services/history-router.service'
import { rescheduleFieldEditors, missingFieldHandlers } from './appointment-reschedule.selects'
import { sendWhatsAppMessage } from '../../../api/meta.api'
import { DateFormatter } from '../../../utils/date'

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
      messages: {
        confirmation: 'Confira o resumo e confirme a remarcação, por favor.',
        creationSuccess: 'Agendamento remarquado com sucesso!',
        creationResponse: 'Tudo certo, agendamento atualizado.',
        cancelSent: 'Beleza, remarcação cancelada.',
        cancelResponse: 'Operação cancelada.',
        missingDataDuringConfirm: 'Faltam alguns dados. Vamos preencher?',
        invalidField: 'Esse campo não dá pra alterar pelo menu. Me manda uma mensagem com o novo valor.',
        editModeIntro: 'Bora editar a remarcação. Me diz o que você quer mudar.',
        editModeExamples: ['"Mudar a data"', '"Trocar o horário"'],
        editRecordNotFound: 'Não achei a remarcação pra editar.',
        editFieldUpdateError: 'Não consegui alterar esse campo.',
        editPromptFallback: 'Qual a informação nova?',
        editDirectChangeSuccess: 'Dados atualizados.',
        editUpdateSuccess: 'Remarcação atualizada!',
        editUpdateError: 'Erro ao atualizar. Tenta de novo?',
        deleteRecordNotFound: 'Não achei a remarcação pra deletar.',
        deleteSuccess: 'Remarcação deletada com sucesso!',
        deleteError: 'Erro ao deletar. Tenta de novo?',
        buttonHeaderSuccess: 'Agendamento remarquado!',
        useNaturalLanguage: false,
      },
      accessControl: {
        deniedMessage: 'Esse plano ainda não tem essa funcionalidade.',
      },
    })
  }

  startAppointmentReschedule = async (args: { phone: string }) => {
    return super.startRegistration(args)
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
    await sendWhatsAppMessage(phone, 'Confirma a remarcação?')
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
      message: 'O que você quer fazer?',
      editLabel: 'Editar',
      cancelLabel: 'Cancelar',
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
