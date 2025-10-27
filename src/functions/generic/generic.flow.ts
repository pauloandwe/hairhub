import { sendWhatsAppMessage } from '../../api/meta.api'
import { AppErrorCodes } from '../../enums/constants'
import { FlowStep, FlowType } from '../../enums/generic.enum'
import { getUserContext, getUserContextSync, resetActiveRegistration, setUserContext, UserRuntimeContext } from '../../env.config'
import { GenericService } from '../../services/generic/generic.service'
import { IBaseEntity } from '../../services/generic/generic.types'
import { clearAllUserIntents } from '../../services/intent-history.service'
import { ChangeResponse, FieldEditor } from '../functions.types'
import { randomUUID } from 'crypto'
import { sendSingleActionButton } from '../../interactives/genericConfirmation'
import { appendUserTextAuto } from '../../services/history-router.service'
import { getAppErrorMessage } from '../../utils/error-messages'
import { naturalLanguageGenerator } from '../../services/natural-language-generator.service'

export type MissingFieldHandlerResult<TDraft> = {
  message: string
  interactive: boolean
  draft: TDraft
}

export type MissingFieldHandler<TDraft> = (phone: string, draft: TDraft) => Promise<MissingFieldHandlerResult<TDraft>>

export type FlowResponse<TDraft> = {
  message: string
  interactive: boolean
  draft?: TDraft
}

const DEFAULT_EXTERNAL_API_ERROR_MESSAGE = getAppErrorMessage(AppErrorCodes.DEFAULT_EXTERNAL_API_ERROR)

type EditRecordFieldResponse = ChangeResponse & { error?: string }

interface FlowMessages {
  confirmation: string
  creationSuccess: string
  creationResponse: string
  cancelSent: string
  cancelResponse: string
  missingDataDuringConfirm: string
  invalidField: string
  editModeIntro?: string
  editModeExamples?: string[]
  editRecordNotFound?: string
  editFieldUpdateError?: string
  editPromptFallback?: string
  editDirectChangeSuccess?: string
  editUpdateSuccess?: string
  editUpdateError?: string
  deleteRecordNotFound?: string
  deleteSuccess?: string
  deleteError?: string
  useNaturalLanguage?: boolean
  buttonHeaderSuccess?: string
  buttonHeaderEdit?: string
}

export interface FlowAccessControlOptions {
  allowedPlanIds?: number[]
  notAllowedSubPlansIds?: number[]
  deniedMessage: string
  resetRegistrationOnDeny?: boolean
}

export interface GenericCrudFlowOptions<TDraft, TCreationPayload, TRecord extends IBaseEntity, TUpsertArgs, TEditableField extends keyof TUpsertArgs & string, TMissingField extends keyof TDraft & string> {
  service: GenericService<TDraft, TCreationPayload, TRecord, TUpsertArgs>
  flowType: FlowType
  fieldEditors: Record<TEditableField, FieldEditor>
  missingFieldHandlers: Record<TMissingField, MissingFieldHandler<TDraft>>
  messages: FlowMessages
  accessControl?: FlowAccessControlOptions
}

export abstract class GenericCrudFlow<TDraft, TCreationPayload, TRecord extends IBaseEntity, TUpsertArgs, TEditableField extends keyof TUpsertArgs & string, TMissingField extends keyof TDraft & string> {
  protected constructor(protected readonly options: GenericCrudFlowOptions<TDraft, TCreationPayload, TRecord, TUpsertArgs, TEditableField, TMissingField>) {}

  protected getInvalidFieldNamespace(): string {
    return `${this.options.flowType.toUpperCase()}_INVALID_FIELD`
  }

  async startRegistration(args: { phone: string } & Partial<TUpsertArgs>): Promise<FlowResponse<TDraft>> {
    const { phone, ...rawUpdates } = args
    const context = getUserContextSync(phone)
    const hasCompletedDraft = context?.activeRegistration?.status === 'completed'
    const isEditMode = context?.activeRegistration?.editMode
    const currentSessionId = context?.activeRegistration?.sessionId

    const newSessionId = !isEditMode && hasCompletedDraft ? randomUUID() : currentSessionId

    if (hasCompletedDraft) {
      await this.options.service.clearDraft(phone)
      await this.setUserContextWithFlowStep(
        phone,
        {
          status: 'collecting',
          sessionId: newSessionId,
          completedDraftSnapshot: undefined,
          lastCreatedRecordId: undefined,
        },
        FlowStep.Creating,
      )
    }
    const accessDenied = await this.ensureFlowAccess(phone, context)
    if (accessDenied) return accessDenied
    const isNewFlow = context?.activeRegistration?.type !== this.options.flowType

    const updates = rawUpdates as Partial<TUpsertArgs>
    const updatedDraft = await this.options.service.updateDraft(phone, updates)

    if (isNewFlow) {
      await this.onFirstStart(phone, updatedDraft)
    }

    await this.setFlowContext(phone)

    const missingResult = await this.handleNextMissing(phone, updatedDraft)
    if (missingResult) return missingResult

    return this.presentConfirmation(phone, updatedDraft)
  }

  async continueRegistration(args: { phone: string }): Promise<FlowResponse<TDraft>> {
    const { phone } = args
    const accessDenied = await this.ensureFlowAccess(phone)
    if (accessDenied) return accessDenied
    await this.setFlowContext(phone)

    const draft = await this.options.service.loadDraft(phone)

    const missingResult = await this.handleNextMissing(phone, draft)
    if (missingResult) return missingResult

    return this.presentConfirmation(phone, draft)
  }

  async confirmRegistration(args: { phone: string }): Promise<FlowResponse<TDraft>> {
    const { phone } = args
    const accessDenied = await this.ensureFlowAccess(phone)
    if (accessDenied) return accessDenied
    await this.setFlowContext(phone)

    const draft = await this.options.service.loadDraft(phone)

    const missing = await this.getMissingFields(draft)
    if (missing.length > 0) {
      await sendWhatsAppMessage(phone, this.options.messages.missingDataDuringConfirm)
      await this.onMissingDataDuringConfirm(phone, draft, missing)
      const next = await this.handleNextMissing(phone, draft)
      if (next) return next
      return this.buildResponse(this.options.messages.missingDataDuringConfirm, false, draft)
    }

    try {
      await this.beforeCreate(phone, draft)
      const summary = await this.generateSummary(phone, draft)

      const createdRecord = await this.options.service.create(phone, draft)
      const completedDraft = await this.finalizeSuccessfulCreation(phone, draft, summary, createdRecord.id)
      await clearAllUserIntents(phone)

      const successMessage = await this.generateSuccessMessage(phone, summary, 'created')
      await sendWhatsAppMessage(phone, successMessage)
      await this.onAfterCreateSuccess(phone, completedDraft, summary)

      return this.buildResponse(this.options.messages.creationResponse, false)
    } catch (err) {
      const userFacingMessage = this.options.service.handleServiceError(err)
      await sendWhatsAppMessage(phone, userFacingMessage)

      try {
        const summary = await this.generateSummary(phone, draft)
        await this.sendEditCancelOptionsAfterCreationError(phone, draft, summary, userFacingMessage)
      } catch (buttonError) {
        console.error(`[GenericCrudFlow:${this.options.flowType}] Erro ao enviar botões após falha de criação.`, buttonError)
      }

      await this.onCreateError(phone, draft, err, userFacingMessage)
      return this.buildResponse(userFacingMessage, false, draft)
    }
  }

  async cancelRegistration(args: { phone: string }): Promise<FlowResponse<TDraft>> {
    const { phone } = args
    await this.options.service.clearDraft(phone)
    await resetActiveRegistration(phone)
    await clearAllUserIntents(phone)

    await sendWhatsAppMessage(phone, this.options.messages.cancelSent)
    await this.onCancel(phone)

    return this.buildResponse(this.options.messages.cancelResponse, false)
  }

  async changeRegistrationField(args: { phone: string; field: TEditableField }): Promise<ChangeResponse> {
    const { phone, field } = args
    await this.setFlowContext(phone)

    const editor = this.options.fieldEditors[field]
    if (!editor) {
      await sendWhatsAppMessage(phone, this.options.messages.invalidField)
      return this.buildChangeResponse(this.options.messages.invalidField, false)
    }

    return editor(phone)
  }

  protected async changeRegistrationWithValue(args: { phone: string; field: TEditableField; value?: any; logContext?: string }): Promise<FlowResponse<TDraft>> {
    const { phone, field, value, logContext } = args
    const context = getUserContextSync(phone)
    const currentRegistration = context?.activeRegistration || {}
    const isEditMode = !!currentRegistration?.editMode
    const hasCompletedDraft = currentRegistration?.status === 'completed'

    if (!isEditMode && hasCompletedDraft) {
      await this.resetCompletedDraftForFieldChange(phone, currentRegistration)
    } else {
      await setUserContext(phone, {
        activeRegistration: {
          ...currentRegistration,
          type: this.options.flowType,
          step: isEditMode ? FlowStep.Editing : FlowStep.Creating,
          status: 'collecting',
        },
      })
    }

    const isFieldValid = this.options.service.isFieldValid(field)
    if (!isFieldValid) {
      await sendWhatsAppMessage(phone, this.options.messages.invalidField)
      return this.startRegistration({ phone } as { phone: string } & Partial<TUpsertArgs>)
    }

    if (value !== undefined) {
      await this.clearAwaitingInputForField(phone)

      if (isEditMode) {
        await this.restoreCompletedDraftSnapshot(phone)

        const updatedDraft = await this.options.service.processFieldEdit(phone, field, value)
        if (updatedDraft) {
          const fieldUpdate = { [field]: value } as Partial<TUpsertArgs>
          const result = await this.finalizeEditOperation({
            phone,
            updatedDraft,
            updates: fieldUpdate,
            successMessage: this.options.messages.editUpdateSuccess,
            logContext: logContext ?? `Campo ${field} atualizado com valor ${JSON.stringify(value)}`,
          })

          if ('updatedDraft' in result) {
            const successMessage = this.options.messages.editUpdateSuccess ?? 'Registro editado com sucesso.'
            return this.buildResponse(successMessage, false, result.updatedDraft)
          }

          return this.buildResponse(result.error, false)
        }

        const failureMessage = this.options.messages.editFieldUpdateError ?? 'Não consegui alterar o campo informado.'
        await sendWhatsAppMessage(phone, failureMessage)
        return this.buildResponse(failureMessage, false)
      }

      const successMessage = this.options.messages.editDirectChangeSuccess ?? 'Dados alterados com sucesso.'
      await sendWhatsAppMessage(phone, successMessage)
      return this.startRegistration({ phone, [field]: value } as { phone: string } & Partial<TUpsertArgs>)
    }

    await this.setAwaitingInputForField(phone, field)
    if (isEditMode) {
      await this.restoreCompletedDraftSnapshot(phone)
    }

    const changeResponse = await this.changeRegistrationField({ phone, field })
    return this.buildResponse(changeResponse.message, changeResponse.interactive)
  }

  protected async enterEditMode(args: { phone: string }): Promise<FlowResponse<TDraft>> {
    const { phone } = args
    const context = getUserContextSync(phone)
    let recordId = context?.activeRegistration?.lastCreatedRecordId ?? null

    let completedDraft = await this.restoreCompletedDraftSnapshot(phone)
    if (!recordId) {
      const draftRecordId = (completedDraft as any)?.recordId
      if (draftRecordId) {
        recordId = draftRecordId as string
      } else {
        const storedDraft = await this.options.service.loadDraft(phone)
        recordId = (storedDraft as any)?.recordId ?? null
        if (recordId) {
          this.updateCompletedDraftSnapshot(phone, storedDraft)
          completedDraft = storedDraft
        }
      }
    }

    if (!recordId) {
      const message = this.options.messages.editRecordNotFound ?? 'Não foi possível encontrar o registro para editar.'
      await sendWhatsAppMessage(phone, message)
      return this.buildResponse(message, false)
    }

    const currentRegistration = context?.activeRegistration || {}
    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        editMode: true,
        type: this.options.flowType,
        step: FlowStep.Editing,
        status: 'collecting',
        awaitingInputForField: undefined,
      },
    })

    if (!completedDraft) {
      completedDraft = await this.restoreCompletedDraftSnapshot(phone)
    }

    const introMessage = this.buildEditModeIntroMessage()
    if (introMessage) {
      await sendWhatsAppMessage(phone, introMessage)
    }

    await this.afterEnterEditMode(phone, recordId, completedDraft ?? null)

    return this.buildResponse(introMessage ?? '', false, completedDraft ?? undefined)
  }

  protected async deleteRecord(args: { phone: string }): Promise<FlowResponse<TDraft>> {
    const { phone } = args
    const context = getUserContextSync(phone)
    const recordId = context?.activeRegistration?.lastCreatedRecordId ?? null

    if (!recordId) {
      const message = this.options.messages.deleteRecordNotFound ?? 'Não foi possível encontrar o registro para excluir.'
      await sendWhatsAppMessage(phone, message)
      return this.buildResponse(message, false)
    }

    try {
      await this.options.service.delete(phone, recordId)

      try {
        await this.options.service.clearDraft(phone)
      } catch (cleanupError) {
        await this.onDeleteCleanupError(phone, recordId, 'clearDraft', cleanupError)
      }

      try {
        await clearAllUserIntents(phone)
      } catch (cleanupError) {
        await this.onDeleteCleanupError(phone, recordId, 'clearIntents', cleanupError)
      }

      await resetActiveRegistration(phone)
      const successMessage = await this.generateSuccessMessage(phone, `Registro ID: ${recordId}`, 'deleted')
      await sendWhatsAppMessage(phone, successMessage)
      await this.afterDeleteSuccess(phone, recordId)
      return this.buildResponse(successMessage, false)
    } catch (error) {
      const errorMessage = this.options.messages.deleteError ?? 'Erro ao excluir o registro. Por favor, tente novamente.'
      await sendWhatsAppMessage(phone, errorMessage)
      await this.onDeleteFailure(phone, recordId, error)
      return this.buildResponse(errorMessage, false)
    }
  }

  protected async editRecordField(args: { phone: string; field: string; value?: any; promptMessage?: string }): Promise<EditRecordFieldResponse> {
    const { phone, field, value, promptMessage } = args
    const context = getUserContextSync(phone)
    const recordId = context?.activeRegistration?.lastCreatedRecordId ?? null

    if (!this.options.service.isFieldValid(field)) {
      await this.sendInvalidFieldMessage({ phone, field })
      return { message: this.options.messages.invalidField, interactive: false }
    }

    if (!recordId) {
      const message = this.options.messages.editRecordNotFound ?? 'Registro não encontrado.'
      await sendWhatsAppMessage(phone, message)
      return { ...this.buildChangeResponse(message, false), error: 'Registro não encontrado' }
    }

    if (value !== undefined) {
      const result = await this.applyRecordUpdates({
        phone,
        updates: { [field]: value } as Partial<TUpsertArgs>,
        logContext: `Campo ${field} atualizado com valor ${JSON.stringify(value)}`,
      })
      if (result.error) {
        return { ...this.buildChangeResponse(result.error, false), error: result.error }
      }
      const message = result.message ?? 'Campo atualizado com sucesso'
      return this.buildChangeResponse(message, false)
    }

    const currentRegistration = context?.activeRegistration || {}
    await this.setUserContextWithFlowStep(
      phone,
      {
        awaitingInputForField: field,
        status: 'collecting',
      },
      FlowStep.Editing,
      currentRegistration,
    )

    const typedField = field as TEditableField
    const fieldEditor = this.options.fieldEditors[typedField]

    if (fieldEditor) {
      return fieldEditor(phone)
    }

    const fallbackMessage = promptMessage ?? this.options.messages.editPromptFallback ?? 'Qual o novo valor?'
    await sendWhatsAppMessage(phone, fallbackMessage)
    return this.buildChangeResponse(fallbackMessage, false)
  }

  protected async applyRecordUpdates(args: { phone: string; updates: Partial<TUpsertArgs>; successMessage?: string; logContext?: string }): Promise<{ message?: string; error?: string }> {
    const { phone, updates, successMessage, logContext } = args
    const context = getUserContextSync(phone)
    const recordId = context?.activeRegistration?.lastCreatedRecordId ?? null

    if (!recordId) {
      const message = this.options.messages.editRecordNotFound ?? 'Registro não encontrado.'
      await sendWhatsAppMessage(phone, message)
      return { error: 'Registro não encontrado' }
    }

    try {
      await this.restoreCompletedDraftSnapshot(phone)

      const updatedDraft = await this.options.service.updateDraft(phone, updates)
      const result = await this.finalizeEditOperation({
        phone,
        updatedDraft,
        updates,
        successMessage: successMessage ?? this.options.messages.editUpdateSuccess,
        logContext,
      })

      if ('error' in result) {
        return result
      }

      return { message: 'Campo atualizado com sucesso' }
    } catch (error) {
      const errorMessage = this.resolveEditErrorMessage(error)
      await sendWhatsAppMessage(phone, errorMessage)
      await this.onEditFailure(phone, recordId, error, logContext)
      return { error: errorMessage }
    }
  }

  protected async finalizeEditOperation(args: { phone: string; updatedDraft: TDraft; updates: Partial<TUpsertArgs>; successMessage?: string; logContext?: string }): Promise<{ updatedDraft: TDraft } | { error: string }> {
    const { phone, updatedDraft, updates, successMessage, logContext } = args
    const context = getUserContextSync(phone)
    const recordId = context?.activeRegistration?.lastCreatedRecordId ?? null

    if (!recordId) {
      const message = this.options.messages.editRecordNotFound ?? 'Registro não encontrado.'
      await sendWhatsAppMessage(phone, message)
      return { error: 'Registro não encontrado' } as const
    }

    try {
      await this.options.service.update(phone, recordId, updatedDraft, updates)

      const summary = await this.generateSummary(phone, updatedDraft)

      const completedDraft = { ...updatedDraft, status: 'completed' as const, recordId }
      await this.options.service.saveDraft(phone, completedDraft)

      const completedDraftSnapshot = JSON.parse(JSON.stringify(completedDraft))

      const currentRegistration = getUserContextSync(phone)?.activeRegistration || {}
      const currentSessionId = currentRegistration.sessionId

      await setUserContext(phone, {
        activeRegistration: {
          ...currentRegistration,
          type: undefined,
          status: 'completed',
          step: undefined,
          awaitingInputForField: undefined,
          editMode: undefined,
          lastCreatedRecordId: recordId,
          completedDraftSnapshot,
          snapshotSessionId: currentSessionId,
        },
      })

      if (this.options.messages.useNaturalLanguage) {
        const message = successMessage ?? (await this.generateSuccessMessage(phone, summary, 'updated'))
        await sendWhatsAppMessage(phone, message)
      }

      await this.sendEditDeleteOptions(phone, completedDraft, summary, recordId)
      await this.afterEditSuccess(phone, recordId, updates, logContext)

      return { updatedDraft: completedDraft } as const
    } catch (error) {
      const errorMessage = this.resolveEditErrorMessage(error)
      await sendWhatsAppMessage(phone, errorMessage)

      try {
        const summary = await this.generateSummary(phone, updatedDraft)
        await this.sendEditDeleteOptionsAfterError(phone, updatedDraft, summary, recordId, errorMessage)
      } catch (buttonError) {
        console.error(`[GenericCrudFlow:${this.options.flowType}] Erro ao enviar botões após falha de edição.`, buttonError)
      }

      await this.onEditFailure(phone, recordId, error, logContext)
      return { error: errorMessage } as const
    }
  }

  protected buildResponse(message: string, interactive: boolean, draft?: TDraft): FlowResponse<TDraft> {
    return { message, interactive, draft }
  }

  protected async generateSummary(phone: string, draft: TDraft): Promise<string> {
    if (this.options.messages.useNaturalLanguage) {
      try {
        return await this.options.service.buildDraftSummaryNatural(draft, phone)
      } catch (error) {
        console.error(`[GenericCrudFlow:${this.options.flowType}] Erro ao gerar resumo em linguagem natural, usando fixo.`, error)
        return this.options.service.buildDraftSummary(draft)
      }
    }
    return this.options.service.buildDraftSummary(draft)
  }

  protected async generateSuccessMessage(phone: string, summary: string, actionType: 'created' | 'updated' | 'deleted'): Promise<string> {
    if (this.options.messages.useNaturalLanguage) {
      try {
        return await naturalLanguageGenerator.generateSuccessMessage(phone, summary, actionType)
      } catch (error) {
        console.error(`[GenericCrudFlow:${this.options.flowType}] Erro ao gerar mensagem de sucesso, usando mensagem fixa.`, error)
        const messageMap = {
          created: this.options.messages.creationSuccess,
          updated: this.options.messages.editUpdateSuccess ?? 'Registro atualizado com sucesso.',
          deleted: this.options.messages.deleteSuccess ?? 'Registro excluído com sucesso.',
        }
        return messageMap[actionType]
      }
    }
    const messageMap = {
      created: this.options.messages.creationSuccess,
      updated: this.options.messages.editUpdateSuccess ?? 'Registro atualizado com sucesso.',
      deleted: this.options.messages.deleteSuccess ?? 'Registro excluído com sucesso.',
    }
    return messageMap[actionType]
  }

  protected resolveEditErrorMessage(error: unknown): string {
    const fallbackMessage = this.options.messages.editUpdateError ?? 'Erro ao atualizar o registro.'
    const serviceMessage = this.options.service.handleServiceError(error)
    if (serviceMessage && serviceMessage !== DEFAULT_EXTERNAL_API_ERROR_MESSAGE) {
      return serviceMessage
    }
    return fallbackMessage
  }

  protected buildChangeResponse(message: string, interactive: boolean): ChangeResponse {
    return { message, interactive }
  }

  protected async setFlowContext(phone: string): Promise<void> {
    const currentRegistration = getUserContextSync(phone)?.activeRegistration || {}
    const status = currentRegistration.status && currentRegistration.status !== 'completed' ? currentRegistration.status : 'collecting'

    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        type: this.options.flowType,
        step: currentRegistration.step ?? FlowStep.Creating,
        status,
      },
    })
  }

  protected async sendInvalidFieldMessage(args: { phone: string; field: string }): Promise<void> {
    const { phone, field } = args
    const validFields = this.options.service.getValidFieldsFormatted()
    const errorMessage = `O campo "${field}" não pode ser editado. Campos válidos: ${validFields}.`

    await sendSingleActionButton({
      namespace: `${this.getInvalidFieldNamespace()}_${Date.now()}`,
      userId: phone,
      message: errorMessage,
      buttonLabel: 'Editar outro campo',
      summaryText: undefined,
      onAction: async (userId: string) => {
        await appendUserTextAuto(userId, 'Editar outro campo')
        await sendWhatsAppMessage(userId, 'Qual campo deseja editar? Você pode me dizer qual informação deseja alterar.')
      },
    })
  }

  protected async handleNextMissing(phone: string, draft: TDraft): Promise<FlowResponse<TDraft> | null> {
    const missing = await this.getMissingFields(draft)
    if (!missing.length) return null

    const field = missing[0]
    const handler = this.options.missingFieldHandlers[field]
    if (!handler) return null

    await this.setAwaitingInputForField(phone, field as string)

    return handler(phone, draft)
  }

  protected async presentConfirmation(phone: string, draft: TDraft): Promise<FlowResponse<TDraft>> {
    try {
      await this.beforeConfirmation(phone, draft)
      await this.prepareDraftForConfirmation(phone, draft)
      const summary = await this.generateSummary(phone, draft)

      const createdRecord = await this.options.service.create(phone, draft)

      const completedDraft = await this.finalizeSuccessfulCreation(phone, draft, summary, createdRecord.id)
      await clearAllUserIntents(phone)

      await this.onAfterCreateSuccess(phone, completedDraft, summary)

      if (this.options.messages.useNaturalLanguage) {
        const successMessage = await this.generateSuccessMessage(phone, summary, 'created')
        await sendWhatsAppMessage(phone, successMessage)
      }

      await this.sendEditDeleteOptions(phone, completedDraft, summary, createdRecord.id)
      await this.onAfterConfirmationSent(phone, completedDraft, summary)

      return this.buildResponse(this.options.messages.confirmation, false, completedDraft)
    } catch (err) {
      const userFacingMessage = this.options.service.handleServiceError(err)
      await sendWhatsAppMessage(phone, userFacingMessage)

      try {
        const summary = await this.generateSummary(phone, draft)
        await this.sendEditCancelOptionsAfterCreationError(phone, draft, summary, userFacingMessage)
      } catch (buttonError) {
        console.error(`[GenericCrudFlow:${this.options.flowType}] Erro ao enviar botões após falha de criação.`, buttonError)
      }

      await this.onCreateError(phone, draft, err, userFacingMessage)
      return this.buildResponse(userFacingMessage, false, draft)
    }
  }

  protected async beforeCreate(_phone: string, _draft: TDraft): Promise<void> {
    void _phone
    void _draft
  }

  protected async beforeConfirmation(_phone: string, _draft: TDraft): Promise<void> {
    void _phone
    void _draft
  }

  protected async prepareDraftForConfirmation(phone: string, draft: TDraft): Promise<void> {
    await this.options.service.saveDraft(phone, draft)
  }

  protected async afterCreateSuccess(_phone: string, _draft: TDraft, _summary: string): Promise<void> {
    void _phone
    void _draft
    void _summary
  }

  protected async onFirstStart(_phone: string, _draft: TDraft): Promise<void> {
    void _phone
    void _draft
  }

  protected async onAfterConfirmationSent(_phone: string, _draft: TDraft, _summary: string): Promise<void> {
    void _phone
    void _draft
    void _summary
  }

  protected async onAfterCreateSuccess(_phone: string, _draft: TDraft, _summary: string): Promise<void> {
    void _phone
    void _draft
    void _summary
  }

  protected async onCancel(_phone: string): Promise<void> {
    void _phone
  }

  protected async onMissingDataDuringConfirm(_phone: string, _draft: TDraft, _missing: TMissingField[]): Promise<void> {
    void _phone
    void _draft
    void _missing
  }

  protected abstract sendConfirmation(phone: string, draft: TDraft, summary: string): Promise<void>

  protected abstract sendEditDeleteOptions(phone: string, draft: TDraft, summary: string, recordId: string): Promise<void>

  protected abstract sendEditDeleteOptionsAfterError(phone: string, draft: TDraft, summary: string, recordId: string, errorMessage: string): Promise<void>

  protected abstract sendEditCancelOptionsAfterCreationError(phone: string, draft: TDraft, summary: string, errorMessage: string): Promise<void>

  protected async onCreateError(_phone: string, _draft: TDraft, _error: unknown, _userMessage: string): Promise<void> {
    void _phone
    void _draft
    void _error
    void _userMessage
  }

  private async finalizeSuccessfulCreation(phone: string, draft: TDraft, summary: string, recordId: string): Promise<TDraft> {
    const completedDraft = { ...(draft as any), status: 'completed' as const, recordId } as TDraft
    const completedDraftSnapshot = JSON.parse(JSON.stringify(completedDraft)) as TDraft

    await this.options.service.saveDraft(phone, completedDraft)

    const currentRegistration = getUserContextSync(phone)?.activeRegistration || {}
    const currentSessionId = currentRegistration.sessionId

    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        type: undefined,
        status: 'completed',
        step: undefined,
        awaitingInputForField: undefined,
        editMode: undefined,
        lastCreatedRecordId: recordId,
        completedDraftSnapshot,
        snapshotSessionId: currentSessionId,
      },
    })

    await this.afterCreateSuccess(phone, completedDraft, summary)

    return completedDraft
  }

  protected async restoreCompletedDraftSnapshot(phone: string): Promise<TDraft | null> {
    const snapshot = (await getUserContext(phone))?.activeRegistration?.completedDraftSnapshot as TDraft | undefined
    if (!snapshot) return null
    const draftClone = JSON.parse(JSON.stringify(snapshot)) as TDraft
    await this.options.service.saveDraft(phone, draftClone)
    return draftClone
  }

  protected async updateCompletedDraftSnapshot(phone: string, draft: TDraft): Promise<void> {
    const currentRegistration = (await getUserContext(phone))?.activeRegistration || {}
    const draftClone = JSON.parse(JSON.stringify(draft)) as TDraft
    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        completedDraftSnapshot: draftClone,
      },
    })
  }

  protected buildEditModeIntroMessage(): string | null {
    const intro = this.options.messages.editModeIntro
    if (!intro) return null
    const examples = this.options.messages.editModeExamples ?? []
    if (!examples.length) return intro
    const formattedExamples = examples.map((example) => `• ${example}`).join('\n')
    return `${intro}\n\nExemplos:\n${formattedExamples}`
  }

  protected async promptForDraftEdit(phone: string): Promise<void> {
    const currentRegistration = getUserContextSync(phone)?.activeRegistration || {}

    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        editMode: true,
        type: this.options.flowType,
        step: FlowStep.Editing,
        status: 'collecting',
        awaitingInputForField: undefined,
      },
    })

    const introMessage = this.buildEditModeIntroMessage() || 'Me diga o que você quer alterar. Por exemplo: "mudar data para 20/03", "trocar o lote", etc.'
    await sendWhatsAppMessage(phone, introMessage)
  }

  protected async afterEnterEditMode(_phone: string, _recordId: string, _draft: TDraft | null): Promise<void> {
    void _phone
    void _recordId
    void _draft
  }

  protected async afterEditSuccess(_phone: string, _recordId: string, _updates: Partial<TUpsertArgs>, _logContext?: string): Promise<void> {
    void _phone
    void _recordId
    void _updates
    void _logContext
  }

  protected async onEditFailure(_phone: string, recordId: string | null, error: unknown, _logContext?: string): Promise<void> {
    void _phone
    void _logContext
    if (error) {
      console.error(`[GenericCrudFlow:${this.options.flowType}] Erro ao atualizar registro ${recordId ?? 'desconhecido'}.`, error)
    }
  }

  protected async afterDeleteSuccess(_phone: string, _recordId: string): Promise<void> {
    void _phone
    void _recordId
  }

  protected async onDeleteCleanupError(_phone: string, recordId: string, step: 'clearDraft' | 'clearIntents', error: unknown): Promise<void> {
    void _phone
    console.error(`[GenericCrudFlow:${this.options.flowType}] Erro durante limpeza (${step}) do registro ${recordId}.`, error)
  }

  protected async onDeleteFailure(_phone: string, recordId: string | null, error: unknown): Promise<void> {
    void _phone
    console.error(`[GenericCrudFlow:${this.options.flowType}] Erro ao excluir registro ${recordId ?? 'desconhecido'}.`, error)
  }

  private async resetCompletedDraftForFieldChange(phone: string, currentRegistration: Record<string, any>): Promise<void> {
    await this.options.service.clearDraft(phone)
    const newSessionId = randomUUID()

    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        type: this.options.flowType,
        step: FlowStep.Creating,
        status: 'collecting',
        sessionId: newSessionId,
        completedDraftSnapshot: undefined,
        lastCreatedRecordId: undefined,
      },
    })

    const emptyDraft = await this.options.service.loadDraft(phone)
    await this.options.service.saveDraft(phone, emptyDraft)
  }

  private async setAwaitingInputForField(phone: string, field: string, expectedStep?: FlowStep): Promise<void> {
    await this.setUserContextWithFlowStep(
      phone,
      {
        awaitingInputForField: field,
        status: 'collecting',
      },
      expectedStep ?? FlowStep.Creating,
    )
  }

  private async clearAwaitingInputForField(phone: string): Promise<void> {
    const currentRegistration = getUserContextSync(phone)?.activeRegistration || {}
    if (currentRegistration.awaitingInputForField === undefined) return
    await this.setUserContextWithFlowStep(
      phone,
      {
        awaitingInputForField: undefined,
      },
      (currentRegistration.step as FlowStep) ?? FlowStep.Creating,
    )
  }

  private async getMissingFields(draft: TDraft): Promise<TMissingField[]> {
    const rawMissing = await this.options.service.hasMissingFields(draft)

    return rawMissing.filter((field): field is TMissingField => {
      const handlers = this.options?.missingFieldHandlers
      return handlers != null && field in handlers
    })
  }

  protected async setUserContextWithFlowStep(phone: string, registration: Record<string, any>, forcedStep?: FlowStep, currentRegistrationNew?: Record<string, any>): Promise<void> {
    const currentRegistration = currentRegistrationNew || getUserContextSync(phone)?.activeRegistration || {}

    let step = forcedStep

    if (!step) {
      if (registration.editMode === true) {
        step = FlowStep.Editing
      } else if (currentRegistration.editMode === true) {
        step = FlowStep.Editing
      } else {
        step = registration.step ?? currentRegistration.step ?? FlowStep.Creating
      }
    }

    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        ...registration,
        step,
      },
    })
  }

  protected async ensureFlowAccess(phone: string, context?: UserRuntimeContext | null): Promise<FlowResponse<TDraft> | null> {
    const control = this.options.accessControl
    if (!control) return null

    const resolvedContext = context ?? getUserContextSync(phone)
    const planId = resolvedContext?.farmPlanId
    const subPlanIds = resolvedContext?.farmSubPlanIds ?? []
    const { allowedPlanIds, notAllowedSubPlansIds, deniedMessage, resetRegistrationOnDeny } = control

    const planAllowed = !allowedPlanIds || allowedPlanIds.length === 0 || (planId !== undefined && planId !== null && allowedPlanIds.includes(planId))
    const subPlanNotAllowed = notAllowedSubPlansIds?.length ? subPlanIds.some((subPlanId: any) => notAllowedSubPlansIds.includes(subPlanId)) : false

    if (planAllowed && !subPlanNotAllowed) {
      return null
    }

    if (resetRegistrationOnDeny ?? true) {
      await resetActiveRegistration(phone)
    }

    const message = deniedMessage || 'Desculpe, esta funcionalidade não está disponível para o seu plano atual.'
    await sendWhatsAppMessage(phone, message)
    return this.buildResponse(message, false)
  }
}
