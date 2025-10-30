import { FlowType } from '../../enums/generic.enum'
import { sendConfirmationButtons, sendEditDeleteButtons, sendEditDeleteButtonsAfterError, sendEditCancelButtonsAfterCreationError } from '../../interactives/genericConfirmation'
import { appendUserTextAuto } from '../../services/history-router.service'
import { appointmentService } from '../../services/appointments/appointmentService'
import { AppointmentRecord, IAppointmentCreationPayload, IAppointmentValidationDraft, UpsertAppointmentArgs } from '../../services/appointments/appointment.types'
import { GenericCrudFlow } from '../generic/generic.flow'
import { AppointmentEditField, AppointmentMissingField, appointmentFieldEditors, missingFieldHandlers } from './appointment.selects'

/**
 * AppointmentFlowService - Gerenciador de fluxo de agendamentos
 *
 * Fluxo de Dados:
 * 1. Usuário inicia: startAppointmentRegistration()
 *    - Draft é criado vazio
 *    - Sistema pede dados um a um
 *
 * 2. Usuário preenche dados:
 *    - appointmentDate: "dd/MM/yyyy" (ex: "20/11/2024")
 *    - appointmentTime: "HH:mm" (ex: "14:30")
 *    - service: { id, name }
 *    - barber: { id, name }
 *    - clientName, clientPhone, notes
 *
 * 3. Confirmação: confirmAppointmentRegistration()
 *    - Draft é validado
 *    - appointmentService.transformToApiPayload() converte para ISO strings
 *    - Dados são enviados à API como:
 *      {
 *        businessId, serviceId, barberId,
 *        startDate: "2024-11-20T14:30:00.000Z",
 *        endDate: "2024-11-20T14:50:00.000Z",
 *        source: "whatsapp",
 *        clientPhone: "+5511999999999",
 *        clientName: "Fulano"
 *      }
 */
class AppointmentFlowService extends GenericCrudFlow<IAppointmentValidationDraft, IAppointmentCreationPayload, AppointmentRecord, UpsertAppointmentArgs, AppointmentEditField, AppointmentMissingField> {
  private readonly confirmationNamespace = 'APPOINTMENT_CONFIRMATION'
  private readonly editDeleteNamespace = 'APPOINTMENT_EDIT_DELETE'
  private readonly editDeleteErrorNamespace = 'APPOINTMENT_EDIT_DELETE_ERROR'
  private readonly editCancelErrorNamespace = 'APPOINTMENT_EDIT_CANCEL_ERROR'

  constructor() {
    super({
      service: appointmentService,
      flowType: FlowType.Appointment,
      fieldEditors: appointmentFieldEditors,
      missingFieldHandlers,
      messages: {
        confirmation: 'Confira o resumo e confirma pra mim?',
        creationSuccess: 'Agendamento realizado com sucesso!',
        creationResponse: 'Tudo certo, agendamento criado.',
        cancelSent: 'Beleza, agendamento cancelado.',
        cancelResponse: 'Operação cancelada.',
        missingDataDuringConfirm: 'Faltam alguns dados. Bora preencher?',
        invalidField: 'Esse campo não dá pra alterar pelo menu. Me manda uma mensagem com o novo valor.',
        editModeIntro: 'Bora editar o agendamento. Me diz o que você quer mudar.',
        editModeExamples: ['"Mudar data para 20/03/2024"', '"Alterar o horário"', '"Trocar de barbeiro"'],
        editRecordNotFound: 'Não achei o agendamento pra editar.',
        editFieldUpdateError: 'Não consegui alterar esse campo.',
        editPromptFallback: 'Qual a informação nova?',
        editDirectChangeSuccess: 'Dados atualizados.',
        editUpdateSuccess: 'Agendamento atualizado!',
        editUpdateError: 'Erro ao atualizar. Tenta de novo?',
        deleteRecordNotFound: 'Não achei o agendamento pra deletar.',
        deleteSuccess: 'Agendamento deletado com sucesso!',
        deleteError: 'Erro ao deletar. Tenta de novo?',
        buttonHeaderSuccess: 'Agendamento confirmado!',
        useNaturalLanguage: false,
      },
      accessControl: {
        deniedMessage: 'Esse plano ainda não tem essa funcionalidade.',
      },
    })
  }

  startAppointmentRegistration = async (args: { phone: string } & UpsertAppointmentArgs) => {
    return super.startRegistration(args)
  }

  changeAppointmentRegistrationField = async (args: { phone: string; field: AppointmentEditField; value?: any }) => {
    const logContext = args.value !== undefined ? `Campo ${args.field} atualizado com valor ${JSON.stringify(args.value)}` : undefined
    return this.changeRegistrationWithValue({
      ...args,
      logContext,
    })
  }

  confirmAppointmentRegistration = async (args: { phone: string }) => {
    return super.confirmRegistration(args)
  }

  continueAppointmentRegistration = async (args: { phone: string }) => {
    return super.continueRegistration(args)
  }

  cancelAppointmentRegistration = async (args: { phone: string }) => {
    return super.cancelRegistration(args)
  }

  editAppointmentRegistration = async (args: { phone: string }) => {
    return super.enterEditMode(args)
  }

  editAppointmentRecordField = async (args: { phone: string; field: AppointmentEditField; value?: any }) => {
    return super.editRecordField(args)
  }

  deleteAppointmentRegistration = async (args: { phone: string }) => {
    await this.deleteRecord({ phone: args.phone })
  }

  protected async sendConfirmation(phone: string, draft: IAppointmentValidationDraft, summary: string): Promise<void> {
    await sendConfirmationButtons({
      namespace: this.confirmationNamespace,
      userId: phone,
      message: 'Tudo pronto pra confirmar?',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
      summaryText: summary,
      onConfirm: async (userId) => {
        await appendUserTextAuto(userId, 'Confirmar')
        await this.confirmAppointmentRegistration({ phone: userId })
      },
      onCancel: async (userId) => {
        await appendUserTextAuto(userId, 'Cancelar')
        await this.cancelAppointmentRegistration({ phone: userId })
      },
      loadDraft: appointmentService.loadDraft,
    })
  }

  protected async sendEditDeleteOptions(phone: string, draft: IAppointmentValidationDraft, summary: string, recordId: string): Promise<void> {
    await sendEditDeleteButtons({
      namespace: this.editDeleteNamespace,
      userId: phone,
      message: 'O que você quer fazer?',
      editLabel: 'Editar',
      deleteLabel: 'Deletar',
      summaryText: summary,
      header: this.options.messages.buttonHeaderSuccess || 'Pronto!',
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editAppointmentRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Excluir')
        await this.deleteAppointmentRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditDeleteOptionsAfterError(phone: string, _draft: IAppointmentValidationDraft, summary: string, recordId: string, errorMessage: string): Promise<void> {
    await sendEditDeleteButtonsAfterError({
      namespace: `${this.editDeleteErrorNamespace}_${recordId}`,
      userId: phone,
      message: 'O que você quer fazer agora?',
      editLabel: 'Editar',
      deleteLabel: 'Deletar',
      summaryText: summary,
      header: this.options.messages.buttonHeaderEdit || 'Ops!',
      errorMessage,
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editAppointmentRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Excluir')
        await this.deleteAppointmentRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditCancelOptionsAfterCreationError(phone: string, _draft: IAppointmentValidationDraft, summary: string, errorMessage: string): Promise<void> {
    await sendEditCancelButtonsAfterCreationError({
      namespace: `${this.editCancelErrorNamespace}_${Date.now()}`,
      userId: phone,
      message: 'Como você quer continuar?',
      editLabel: 'Editar dados',
      cancelLabel: 'Cancelar',
      summaryText: summary,
      header: this.options.messages.buttonHeaderEdit || 'Ops!',
      errorMessage,
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar dados')
        await this.promptForDraftEdit(userId)
      },
      onCancel: async (userId) => {
        await appendUserTextAuto(userId, 'Cancelar')
        await this.cancelAppointmentRegistration({ phone: userId })
      },
    })
  }
}

export const appointmentFunctions = new AppointmentFlowService()
