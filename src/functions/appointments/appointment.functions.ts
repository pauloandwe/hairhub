import { FlowStep, FlowType } from '../../enums/generic.enum'
import { AppointmentFields } from '../../enums/cruds/appointmentFields.enum'
import { sendWhatsAppMessage } from '../../api/meta.api'
import { sendConfirmationButtons, sendEditDeleteButtons, sendEditDeleteButtonsAfterError, sendEditCancelButtonsAfterCreationError } from '../../interactives/genericConfirmation'
import { sendAppointmentAvailabilityResolutionList } from '../../interactives/appointments/availabilityResolutionSelection'
import { sendDateSelectionList } from '../../interactives/appointments/dateSelection'
import { sendProfessionalSelectionList } from '../../interactives/appointments/professionalSelection'
import { sendTimeSlotSelectionList } from '../../interactives/appointments/timeSlotSelection'
import { appendUserTextAuto } from '../../services/history-router.service'
import { appointmentIntentService } from '../../services/appointments/appointment-intent.service'
import { appointmentService } from '../../services/appointments/appointmentService'
import { appointmentCancellationFunctions } from './cancellation/appointment-cancellation.functions'
import { AppointmentCreateConflictNextAction, AppointmentRecord, CreateConflictRecoveryResult, IAppointmentCreationPayload, IAppointmentValidationDraft, PendingAppointmentOffer, StartAppointmentArgs, UpsertAppointmentArgs } from '../../services/appointments/appointment.types'
import { DraftPreparationContext, FlowResponse, GenericCrudFlow } from '../generic/generic.flow'
import { AppointmentEditField, AppointmentMissingField, appointmentFieldEditors, missingFieldHandlers } from './appointment.selects'
import { getActivePlanBooking } from '../../interactives/planBookingAction'
import { createHumanFlowMessages } from '../../utils/conversation-copy'
import { getUserContextSync, setUserContext } from '../../env.config'
import { DateFormatter } from '../../utils/date'

const AVAILABILITY_SENSITIVE_FIELDS = new Set<string>(['appointmentDate', 'appointmentTime', 'service', 'professional'])

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
      messages: createHumanFlowMessages({
        confirmation: 'Se estiver tudo certo, posso confirmar seu horario assim?',
        creationSuccess: 'Pronto, seu horario ficou marcado.',
        creationResponse: 'Perfeito, ja deixei seu agendamento confirmado por aqui.',
        cancelSent: 'Tudo bem, parei esse agendamento por aqui.',
        cancelResponse: 'Certo, nao segui com o agendamento.',
        missingDataDuringConfirm: 'Ainda falta um detalhe. Vou te pedir o que falta.',
        editModeIntro: 'Claro. Me fala o que voce quer mudar no agendamento.',
        editModeExamples: ['"Mudar a data"', '"Trocar o horario"', '"Mudar o barbeiro"'],
        editRecordNotFound: 'Nao achei esse agendamento por aqui.',
        editUpdateSuccess: 'Pronto, atualizei seu agendamento.',
        deleteRecordNotFound: 'Nao achei esse agendamento para continuar.',
        deleteSuccess: 'Pronto, esse agendamento foi removido.',
        deleteError: 'Nao consegui remover esse agendamento agora. Tenta de novo?',
        buttonHeaderSuccess: 'Horario confirmado',
        useNaturalLanguage: false,
      }),
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

  private getPlanBookingLockedMessage(): string {
    return 'Esse botao agenda o plano com o servico e o profissional definidos no plano. Se quiser algo diferente, me chame para fazer um agendamento normal.'
  }

  private isPlanBookingLockedField(field: AppointmentEditField | keyof UpsertAppointmentArgs): boolean {
    return field === 'service' || field === 'professional'
  }

  private async sendPlanBookingLockedMessage(phone: string): Promise<void> {
    await sendWhatsAppMessage(phone, this.getPlanBookingLockedMessage())
  }

  private normalizePlanBookingStartArgs(phone: string, updates: UpsertAppointmentArgs): UpsertAppointmentArgs | null {
    const planBooking = getActivePlanBooking(phone)
    if (!planBooking) {
      return updates
    }

    const requestedServiceId = updates.service?.id ? String(updates.service.id) : null
    const requestedServiceName = typeof updates.service?.name === 'string' ? updates.service.name.trim().toLowerCase() : null
    const requestedProfessionalId = updates.professional?.id ? String(updates.professional.id) : null
    const requestedProfessionalName = typeof updates.professional?.name === 'string' ? updates.professional.name.trim().toLowerCase() : null

    if (
      (requestedServiceId && requestedServiceId !== String(planBooking.serviceId)) ||
      (requestedServiceName && requestedServiceName !== planBooking.serviceName.trim().toLowerCase()) ||
      (requestedProfessionalId && requestedProfessionalId !== String(planBooking.professionalId)) ||
      (requestedProfessionalName && requestedProfessionalName !== planBooking.professionalName.trim().toLowerCase())
    ) {
      return null
    }

    return {
      ...updates,
      service: {
        id: String(planBooking.serviceId),
        name: planBooking.serviceName,
        duration: planBooking.serviceDuration ?? undefined,
      },
      professional: {
        id: String(planBooking.professionalId),
        name: planBooking.professionalName,
      },
    }
  }

  private async clearPlanBookingState(phone: string): Promise<void> {
    const currentRegistration = getUserContextSync(phone)?.activeRegistration ?? {}
    if (!currentRegistration.planBooking) {
      return
    }

    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        planBooking: undefined,
      },
    })
  }

  startAppointmentRegistration = async (args: { phone: string } & StartAppointmentArgs) => {
    const { phone, date, time, intentMode = 'book', ...rawUpdates } = args
    const updates = { ...rawUpdates } as unknown as UpsertAppointmentArgs
    const runtimeContext = getUserContextSync(phone)

    if (date !== undefined && updates.appointmentDate === undefined) {
      updates.appointmentDate = date
    }

    if (typeof updates.appointmentDate === 'string' && updates.appointmentDate.trim() && !DateFormatter.isValidISODate(updates.appointmentDate.trim())) {
      return {
        error: 'Nao consegui entender essa data. Me fala outra, por favor.',
      }
    }

    if (time !== undefined && updates.appointmentTime === undefined) {
      updates.appointmentTime = time
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'clientPhone')) {
      updates.clientPhone = this.sanitizePhone(updates.clientPhone ?? null)
    } else {
      const fallbackPhone = this.sanitizePhone(phone)
      if (fallbackPhone) {
        updates.clientPhone = fallbackPhone
      }
    }

    if (!Object.prototype.hasOwnProperty.call(updates, 'clientName') && runtimeContext?.clientName) {
      updates.clientName = runtimeContext.clientName
    }

    const normalizedPlanBookingUpdates = this.normalizePlanBookingStartArgs(phone, updates)
    if (!normalizedPlanBookingUpdates) {
      const message = this.getPlanBookingLockedMessage()
      await this.sendPlanBookingLockedMessage(phone)
      return {
        error: message,
      }
    }

    if (intentMode === 'check_then_offer') {
      return this.handleCheckThenOffer(phone, normalizedPlanBookingUpdates)
    }

    await appointmentIntentService.clearTransientState(phone)

    return super.startRegistration({
      phone,
      ...normalizedPlanBookingUpdates,
    })
  }

  changeAppointmentRegistrationField = async (args: { phone: string; field: AppointmentEditField | string; value?: any }) => {
    const { phone } = args
    const normalizedField = this.normalizeEditableField(args.field)
    if (!normalizedField) {
      await this.sendInvalidFieldMessage({ phone, field: String(args.field) })
      return this.buildResponse(this.options.messages.invalidField, false)
    }

    if (getActivePlanBooking(phone) && this.isPlanBookingLockedField(normalizedField)) {
      await this.sendPlanBookingLockedMessage(phone)
      return this.buildResponse(this.getPlanBookingLockedMessage(), false)
    }

    const normalizedValue = normalizedField === 'clientPhone' && args.value !== undefined ? this.sanitizePhone(args.value) : args.value
    const logContext = normalizedValue !== undefined ? `Campo ${normalizedField} atualizado com valor ${JSON.stringify(normalizedValue)}` : undefined
    return this.changeRegistrationWithValue({
      phone,
      field: normalizedField,
      value: normalizedValue as UpsertAppointmentArgs[AppointmentEditField] | null | undefined,
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

    if (getActivePlanBooking(args.phone) && this.isPlanBookingLockedField(normalizedField)) {
      await this.sendPlanBookingLockedMessage(args.phone)
      return this.buildChangeResponse(this.getPlanBookingLockedMessage(), false)
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
    if (getActivePlanBooking(args.phone) && (Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'service') || Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'professional'))) {
      await this.sendPlanBookingLockedMessage(args.phone)
      return this.buildResponse(this.getPlanBookingLockedMessage(), false)
    }

    if (Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'clientPhone')) {
      sanitizedUpdates.clientPhone = this.sanitizePhone(sanitizedUpdates.clientPhone ?? null)
    }
    return this.applyRecordUpdates({
      ...args,
      updates: sanitizedUpdates,
    })
  }

  private shouldReconcileAvailability(context: DraftPreparationContext<UpsertAppointmentArgs>): boolean {
    if (context.trigger !== 'edit') {
      return true
    }

    const updatedFields = Object.keys(context.updates ?? {})
    return updatedFields.some((field) => AVAILABILITY_SENSITIVE_FIELDS.has(field))
  }

  protected async afterDraftPrepared(phone: string, draft: IAppointmentValidationDraft, context: DraftPreparationContext<UpsertAppointmentArgs>): Promise<{ draft: IAppointmentValidationDraft; response?: FlowResponse<IAppointmentValidationDraft> | null }> {
    if (!this.shouldReconcileAvailability(context)) {
      return { draft }
    }

    const availability = await appointmentService.reconcileDraftAvailability(phone, draft)
    if (availability.contextUpdates) {
      await setUserContext(phone, availability.contextUpdates)
    }

    if (availability.status === 'ok') {
      return { draft: availability.draft }
    }

    await appointmentService.saveDraft(phone, availability.draft)
    await sendWhatsAppMessage(phone, availability.message)

    const nextStep = await this.handleNextMissing(phone, availability.draft)
    if (nextStep) {
      return {
        draft: availability.draft,
        response: nextStep,
      }
    }

    return {
      draft: availability.draft,
      response: this.buildResponse(availability.message, false, availability.draft),
    }
  }

  protected override async buildFreshDraftForRestartedCompletedSession(phone: string, updates?: Partial<UpsertAppointmentArgs>): Promise<IAppointmentValidationDraft | null> {
    return appointmentService.buildFreshDraftForNewRegistration(phone, updates as Partial<StartAppointmentArgs> | undefined)
  }

  protected async recoverFromCreateError(phone: string, draft: IAppointmentValidationDraft, error: unknown): Promise<FlowResponse<IAppointmentValidationDraft> | null> {
    const recovery = await appointmentService.resolveCreateConflictRecovery(phone, draft, error)
    if (!recovery.handled) {
      return null
    }

    return this.presentCreateConflictRecovery(phone, recovery)
  }

  protected async sendConfirmation(phone: string, draft: IAppointmentValidationDraft, summary: string): Promise<void> {
    await sendConfirmationButtons({
      namespace: this.confirmationNamespace,
      userId: phone,
      message: 'Se estiver tudo certo, posso confirmar seu horario?',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Agora nao',
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

  private async presentCreateConflictRecovery(phone: string, recovery: Extract<CreateConflictRecoveryResult, { handled: true }>): Promise<FlowResponse<IAppointmentValidationDraft>> {
    if (recovery.contextUpdates) {
      await setUserContext(phone, recovery.contextUpdates)
    }

    await appointmentService.saveDraft(phone, recovery.draft)

    const field = this.mapConflictNextActionToField(recovery.nextAction)
    await this.setUserContextWithFlowStep(
      phone,
      {
        type: FlowType.Appointment,
        editMode: false,
        status: 'collecting',
        awaitingInputForField: field,
        pendingStep: {
          field,
          mode: 'creating',
        },
      },
      FlowStep.Creating,
    )

    await sendWhatsAppMessage(phone, recovery.message)

    switch (recovery.nextAction) {
      case 'pick_time':
        await sendTimeSlotSelectionList(phone, 'Qual horario fica melhor pra voce?')
        break
      case 'pick_date':
        await sendDateSelectionList(phone, 'Qual dia fica melhor pra voce?')
        break
      case 'pick_professional': {
        const professionalSelection = await sendProfessionalSelectionList(phone, 'Tem preferencia de barbeiro?')
        return this.buildResponse(recovery.message, professionalSelection.interactive, recovery.draft)
      }
    }

    return this.buildResponse(recovery.message, true, recovery.draft)
  }

  private mapConflictNextActionToField(action: AppointmentCreateConflictNextAction): string {
    switch (action) {
      case 'pick_time':
        return AppointmentFields.APPOINTMENT_TIME
      case 'pick_date':
        return AppointmentFields.APPOINTMENT_DATE
      case 'pick_professional':
        return AppointmentFields.PROFESSIONAL
    }
  }

  protected async sendEditDeleteOptions(phone: string, draft: IAppointmentValidationDraft, summary: string, recordId: string): Promise<void> {
    await sendEditDeleteButtons({
      namespace: this.editDeleteNamespace,
      userId: phone,
      message: 'Deseja editar alguma informação ou cancelar esse horário?',
      editLabel: 'Editar',
      deleteLabel: 'Cancelar horário',
      summaryText: summary,
      header: this.options.messages.buttonHeaderSuccess || 'Pronto!',
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editAppointmentRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Cancelar horário')
        await appointmentCancellationFunctions.startAppointmentCancellation({
          phone: userId,
          appointmentId: Number(recordId),
        })
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

  protected override async afterCreateSuccess(phone: string, draft: IAppointmentValidationDraft, _summary: string): Promise<void> {
    if (!draft.recordId) {
      await this.clearPlanBookingState(phone)
      return
    }

    try {
      const hydratedDraft = await appointmentService.hydrateDraftFromRecord(phone, draft.recordId, draft)
      await appointmentService.saveDraft(phone, hydratedDraft)
      await this.updateCompletedDraftSnapshot(phone, hydratedDraft)
    } catch (error) {
      console.error('[AppointmentFlow] Não foi possível hidratar o rascunho após criação.', {
        phone,
        recordId: draft.recordId,
        error,
      })
    } finally {
      await this.clearPlanBookingState(phone)
    }
  }

  protected override async onCancel(phone: string): Promise<void> {
    await this.clearPlanBookingState(phone)
  }

  protected override async afterEnterEditMode(phone: string, recordId: string, draft: IAppointmentValidationDraft | null): Promise<void> {
    try {
      const hydratedDraft = await appointmentService.hydrateDraftFromRecord(phone, recordId, draft ?? undefined)
      await appointmentService.saveDraft(phone, hydratedDraft)
      await this.updateCompletedDraftSnapshot(phone, hydratedDraft)
    } catch (error) {
      console.error('[AppointmentFlow] Não foi possível hidratar o rascunho ao entrar em modo de edição.', {
        phone,
        recordId,
        error,
      })
    }
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

  async acceptPendingOffer(phone: string, offer?: PendingAppointmentOffer | null): Promise<void> {
    const resolvedOffer = offer ?? (await appointmentIntentService.takePendingOffer(phone))
    if (!resolvedOffer) {
      await sendWhatsAppMessage(phone, 'Esse horario expirou por aqui. Pode me pedir de novo?')
      return
    }

    console.info('[AppointmentFlow] Pending offer accepted. Starting registration with preserved slot.', {
      phone,
      appointmentDate: resolvedOffer.appointmentDate,
      appointmentTime: resolvedOffer.appointmentTime,
      serviceId: resolvedOffer.service?.id ?? null,
      professionalId: resolvedOffer.professional?.id ?? null,
    })

    const startArgs = appointmentIntentService.buildStartArgsFromOffer(resolvedOffer)
    await this.startAppointmentRegistration({
      phone,
      ...startArgs,
      intentMode: 'book',
    })
  }

  private async handleCheckThenOffer(phone: string, updates: UpsertAppointmentArgs): Promise<FlowResponse<IAppointmentValidationDraft>> {
    const result = await appointmentIntentService.handleCheckThenOffer(phone, updates as Omit<StartAppointmentArgs, 'intentMode'>)

    if (result.status === 'resolution') {
      await sendAppointmentAvailabilityResolutionList(phone)
      return this.buildResponse(result.resolution.prompt, true)
    }

    if (result.status === 'offer') {
      await sendConfirmationButtons({
        namespace: 'APPOINTMENT_PREBOOKING_OFFER',
        userId: phone,
        message: result.message,
        confirmLabel: 'Quero marcar',
        cancelLabel: 'Agora nao',
        loadDraft: async (userId) => appointmentIntentService.getPendingOfferSnapshot(userId),
        onConfirm: async (userId) => {
          await appendUserTextAuto(userId, 'Quero marcar')
          await this.acceptPendingOffer(userId)
        },
        onCancel: async (userId) => {
          await appendUserTextAuto(userId, 'Agora nao')
          await appointmentIntentService.clearPendingOffer(userId)
          await appointmentIntentService.notifyOfferDeclined(userId)
        },
      })

      return this.buildResponse(result.message, true)
    }

    await sendWhatsAppMessage(phone, result.message)
    return this.buildResponse(result.message, false)
  }
}

export const appointmentFunctions = new AppointmentFlowService()
