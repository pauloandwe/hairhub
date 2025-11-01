import { FlowType } from '../../enums/generic.enum'
import { sendConfirmationButtons, sendEditDeleteButtons, sendEditDeleteButtonsAfterError, sendEditCancelButtonsAfterCreationError } from '../../interactives/genericConfirmation'
import { appendUserTextAuto } from '../../services/history-router.service'
import { appointmentService } from '../../services/appointments/appointmentService'
import { AppointmentRecord, IAppointmentCreationPayload, IAppointmentValidationDraft, UpsertAppointmentArgs } from '../../services/appointments/appointment.types'
import { GenericCrudFlow } from '../generic/generic.flow'
import { AppointmentEditField, AppointmentMissingField, appointmentFieldEditors, missingFieldHandlers } from './appointment.selects'

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

  private sanitizePhone(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null
    }
    const digits = String(value).replace(/\D/g, '').trim()
    return digits.length ? digits : null
  }

  startAppointmentRegistration = async (args: { phone: string } & UpsertAppointmentArgs) => {
    const { phone, ...rawUpdates } = args
    const updates: UpsertAppointmentArgs = { ...rawUpdates }

    if (Object.prototype.hasOwnProperty.call(updates, 'clientPhone')) {
      updates.clientPhone = this.sanitizePhone(updates.clientPhone ?? null)
    } else {
      const fallbackPhone = this.sanitizePhone(phone)
      if (fallbackPhone) {
        updates.clientPhone = fallbackPhone
      }
    }

    return super.startRegistration({
      phone,
      ...updates,
    })
  }

  changeAppointmentRegistrationField = async (args: { phone: string; field: AppointmentEditField | string; value?: any }) => {
    const { phone, value } = args
    const normalizedField = this.normalizeEditableField(args.field)
    if (!normalizedField) {
      await this.sendInvalidFieldMessage({ phone, field: String(args.field) })
      return this.buildResponse(this.options.messages.invalidField, false)
    }

    const normalizedValue = normalizedField === 'clientPhone' && value !== undefined ? this.sanitizePhone(value) : value
    const logContext = normalizedValue !== undefined ? `Campo ${normalizedField} atualizado com valor ${JSON.stringify(normalizedValue)}` : undefined
    return this.changeRegistrationWithValue({
      phone,
      field: normalizedField,
      value: normalizedValue,
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

  editAppointmentRecordField = async (args: { phone: string; field: AppointmentEditField | string; value?: any }) => {
    const normalizedField = this.normalizeEditableField(args.field)
    if (!normalizedField) {
      await this.sendInvalidFieldMessage({ phone: args.phone, field: String(args.field) })
      return this.buildChangeResponse(this.options.messages.invalidField, false)
    }

    const normalizedValue = normalizedField === 'clientPhone' && args.value !== undefined ? this.sanitizePhone(args.value) : args.value
    return super.editRecordField({
      phone: args.phone,
      field: normalizedField,
      value: normalizedValue,
      promptMessage: this.options.messages.editPromptFallback,
    })
  }

  deleteAppointmentRegistration = async (args: { phone: string }) => {
    return this.deleteRecord({ phone: args.phone })
  }

  applyAppointmentRecordUpdates = async (args: { phone: string; updates: Partial<UpsertAppointmentArgs> | Record<string, any>; successMessage?: string; logContext?: string }) => {
    const sanitizedUpdates = this.filterEditableUpdates(args.updates)
    if (Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'clientPhone')) {
      sanitizedUpdates.clientPhone = this.sanitizePhone(sanitizedUpdates.clientPhone ?? null)
    }
    return this.applyRecordUpdates({
      ...args,
      updates: sanitizedUpdates,
    })
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
      message: 'Deseja editar alguma informação?',
      editLabel: 'Editar',
      summaryText: summary,
      header: this.options.messages.buttonHeaderSuccess || 'Pronto!',
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editAppointmentRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditDeleteOptionsAfterError(phone: string, _draft: IAppointmentValidationDraft, summary: string, recordId: string, errorMessage: string): Promise<void> {
    await sendEditDeleteButtonsAfterError({
      namespace: `${this.editDeleteErrorNamespace}_${recordId}`,
      userId: phone,
      message: 'Quer tentar editar de novo?',
      editLabel: 'Editar',
      summaryText: summary,
      header: this.options.messages.buttonHeaderEdit || 'Ops!',
      errorMessage,
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editAppointmentRegistration({ phone: userId })
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

  private normalizeEditableField(field: AppointmentEditField | string | undefined): AppointmentEditField | null {
    if (!field) return null
    if (typeof field !== 'string') return field

    const trimmedField = field.trim()
    if (!trimmedField) return null

    return this.isEditableFieldKey(trimmedField) ? (trimmedField as AppointmentEditField) : null
  }

  private isEditableFieldKey(field: string): field is AppointmentEditField {
    return this.options.service.isFieldValid(field)
  }

  private filterEditableUpdates(updates: Partial<UpsertAppointmentArgs> | Record<string, any> | undefined): Partial<UpsertAppointmentArgs> {
    if (!updates) return {}

    return Object.entries(updates).reduce<Partial<UpsertAppointmentArgs>>((acc, [rawKey, value]) => {
      const trimmedKey = rawKey.trim()
      if (!this.isEditableFieldKey(trimmedKey)) {
        return acc
      }

      const typedKey = trimmedKey as keyof UpsertAppointmentArgs
      acc[typedKey] = value as any
      return acc
    }, {})
  }
}

export const appointmentFunctions = new AppointmentFlowService()
