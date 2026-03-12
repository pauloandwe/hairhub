import { sendWhatsAppMessage } from '../../api/meta.api'
import { AppErrorCodes } from '../../enums/constants'
import { FlowStep, FlowType } from '../../enums/generic.enum'
import { ActiveRegistrationPendingStep, getUserContext, getUserContextSync, resetActiveRegistration, setUserContext, UserRuntimeContext } from '../../env.config'
import { GenericService } from '../../services/generic/generic.service'
import { DraftStatus, IBaseEntity, RegistrationDraftBase } from '../../services/generic/generic.types'
import { clearAllUserIntents } from '../../services/intent-history.service'
import { ChangeResponse, FieldEditor } from '../functions.types'
import { randomUUID } from 'crypto'
import { sendSingleActionButton } from '../../interactives/genericConfirmation'
import { appendUserTextAuto } from '../../services/history-router.service'
import { getAppErrorMessage } from '../../utils/error-messages'
import { naturalLanguageGenerator } from '../../services/natural-language-generator.service'

export type MissingFieldHandlerResult<TDraft extends RegistrationDraftBase> = {
  message: string
  interactive: boolean
  draft: TDraft
}

export type MissingFieldHandler<TDraft extends RegistrationDraftBase> = (phone: string, draft: TDraft) => Promise<MissingFieldHandlerResult<TDraft>>

export type FlowResponse<TDraft extends RegistrationDraftBase> = {
  message: string
  interactive: boolean
  draft?: TDraft
}

export type DraftPreparationContext<TUpsertArgs> = {
  trigger: 'start' | 'continue' | 'edit'
  updates?: Partial<TUpsertArgs>
}

type DraftPreparationResult<TDraft extends RegistrationDraftBase> = {
  draft: TDraft
  response?: FlowResponse<TDraft> | null
}

type ActiveRegistrationState<TDraft extends RegistrationDraftBase> = {
  type?: string
  step?: FlowStep
  editingField?: string
  awaitingInputForField?: string
  pendingStep?: ActiveRegistrationPendingStep
  lastCreatedRecordId?: string
  editMode?: boolean
  status?: DraftStatus
  sessionId?: string
  completedDraftSnapshot?: TDraft
  snapshotSessionId?: string
  [key: string]: unknown
}

const DEFAULT_EXTERNAL_API_ERROR_MESSAGE = getAppErrorMessage(AppErrorCodes.DEFAULT_EXTERNAL_API_ERROR)

type EditRecordFieldResponse = ChangeResponse & { error?: string }

export interface FlowMessages {
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
}

export interface GenericCrudFlowOptions<TDraft extends RegistrationDraftBase, TCreationPayload, TRecord extends IBaseEntity, TUpsertArgs, TEditableField extends keyof TUpsertArgs & string, TMissingField extends keyof TDraft & string> {
  service: GenericService<TDraft, TCreationPayload, TRecord, TUpsertArgs>
  flowType: FlowType
  fieldEditors: Record<TEditableField, FieldEditor>
  missingFieldHandlers: Record<TMissingField, MissingFieldHandler<TDraft>>
  messages: FlowMessages
  accessControl?: FlowAccessControlOptions
}

export abstract class GenericCrudFlow<TDraft extends RegistrationDraftBase, TCreationPayload, TRecord extends IBaseEntity, TUpsertArgs, TEditableField extends keyof TUpsertArgs & string, TMissingField extends keyof TDraft & string> {
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
      await this.resetCompletedDraftForNewSession(phone, (context?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>, rawUpdates as Partial<TUpsertArgs>, newSessionId)
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

    const preparedDraft = await this.afterDraftPrepared(phone, updatedDraft, {
      trigger: 'start',
      updates,
    })
    if (preparedDraft.response) return preparedDraft.response

    const missingResult = await this.handleNextMissing(phone, preparedDraft.draft)
    if (missingResult) return missingResult

    return this.presentConfirmation(phone, preparedDraft.draft)
  }

  async continueRegistration(args: { phone: string }): Promise<FlowResponse<TDraft>> {
    const { phone } = args
    const accessDenied = await this.ensureFlowAccess(phone)
    if (accessDenied) return accessDenied
    await this.setFlowContext(phone)

    const draft = await this.options.service.loadDraft(phone)
    const preparedDraft = await this.afterDraftPrepared(phone, draft, {
      trigger: 'continue',
    })
    if (preparedDraft.response) return preparedDraft.response

    const missingResult = await this.handleNextMissing(phone, preparedDraft.draft)
    if (missingResult) return missingResult

    return this.presentConfirmation(phone, preparedDraft.draft)
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
      const summaryTitle = this.options.messages.buttonHeaderSuccess || 'Pronto!'
      const summary = await this.generateSummary(phone, draft, { title: summaryTitle, tone: 'success' })

      const createdRecord = await this.options.service.create(phone, draft)
      const completedDraft = await this.finalizeSuccessfulCreation(phone, draft, summary, createdRecord.id)
      await clearAllUserIntents(phone)

      const successMessage = await this.generateSuccessMessage(phone, summary, 'created')
      await sendWhatsAppMessage(phone, successMessage)
      await this.onAfterCreateSuccess(phone, completedDraft, summary)

      return this.buildResponse(this.options.messages.creationResponse, false)
    } catch (err) {
      const recovered = await this.recoverFromCreateError(phone, draft, err)
      if (recovered) return recovered

      const userFacingMessage = this.options.service.handleServiceError(err)
      await sendWhatsAppMessage(phone, userFacingMessage)

      try {
        await this.finalizeFailedCreation(phone, draft)

        const errorTitle = this.options.messages.buttonHeaderEdit || 'Ops!'
        const summary = await this.generateSummary(phone, draft, { title: errorTitle, tone: 'error' })
        const recordId = draft?.recordId ?? null
        await this.sendEditCancelOptionsAfterCreationError(phone, draft, summary, userFacingMessage, recordId)
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

  async replayPendingStep(args: { phone: string }): Promise<void> {
    const { phone } = args
    const currentRegistration = (getUserContextSync(phone)?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
    const pendingStep = currentRegistration.pendingStep
    const pendingField = pendingStep?.field ?? currentRegistration.awaitingInputForField

    if (!pendingField) {
      return
    }

    if (pendingStep?.mode === 'editing' || currentRegistration.editMode) {
      await this.editRecordField({
        phone,
        field: pendingField,
        promptMessage: this.options.messages.editPromptFallback,
      })
      return
    }

    await this.continueRegistration({ phone })
  }

  protected async changeRegistrationWithValue(args: { phone: string; field: TEditableField; value?: TUpsertArgs[TEditableField] | null; logContext?: string }): Promise<FlowResponse<TDraft>> {
    const { phone, field, value, logContext } = args
    const context = getUserContextSync(phone)
    const currentRegistration = (context?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
    const isEditMode = Boolean(currentRegistration?.editMode)
    const hasCompletedDraft = currentRegistration?.status === 'completed'

    if (!isEditMode && hasCompletedDraft) {
      await this.resetCompletedDraftForNewSession(phone, currentRegistration, value !== undefined ? ({ [field]: value } as Partial<TUpsertArgs>) : undefined)
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
        const fieldUpdate = { [field]: value } as Partial<TUpsertArgs>
        const result = await this.applyRecordUpdates({
          phone,
          updates: fieldUpdate,
          successMessage: this.options.messages.editUpdateSuccess,
          logContext: logContext ?? `Campo ${field} atualizado com valor ${JSON.stringify(value)}`,
        })

        if ('error' in result) {
          return this.buildResponse(result.error, false)
        }

        return result
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
      const draftRecordId = completedDraft?.recordId
      if (draftRecordId) {
        recordId = draftRecordId
      } else {
        const storedDraft = await this.options.service.loadDraft(phone)
        recordId = storedDraft.recordId ?? null
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

    const currentRegistration = (context?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        editMode: true,
        type: this.options.flowType,
        step: FlowStep.Editing,
        status: 'collecting',
        awaitingInputForField: undefined,
        pendingStep: undefined,
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

  protected async editRecordField(args: { phone: string; field: string; value?: unknown; promptMessage?: string }): Promise<EditRecordFieldResponse> {
    const { phone, field, value, promptMessage } = args
    const context = getUserContextSync(phone)
    const recordId = context?.activeRegistration?.lastCreatedRecordId ?? null
    const isEditMode = Boolean(context?.activeRegistration?.editMode)

    if (!this.options.service.isFieldValid(field)) {
      await this.sendInvalidFieldMessage({ phone, field })
      return { message: this.options.messages.invalidField, interactive: false }
    }

    if (!recordId) {
      if (value !== undefined && isEditMode) {
        const updatedDraft = await this.options.service.updateDraft(phone, { [field]: value } as Partial<TUpsertArgs>)
        if (updatedDraft) {
          const continueResult = await this.continueRegistration({ phone })
          return {
            message: continueResult.message,
            interactive: continueResult.interactive,
          }
        }
      }

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
      if ('error' in result) {
        return { ...this.buildChangeResponse(result.error, false), error: result.error }
      }
      return this.buildChangeResponse(result.message, result.interactive)
    }

    const currentRegistration = (context?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
    await this.setUserContextWithFlowStep(
      phone,
      {
        awaitingInputForField: field,
        pendingStep: {
          field,
          mode: 'editing',
        },
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

  protected async applyRecordUpdates(args: { phone: string; updates: Partial<TUpsertArgs>; successMessage?: string; logContext?: string }): Promise<FlowResponse<TDraft> | { error: string }> {
    const { phone, updates, successMessage, logContext } = args
    const context = getUserContextSync(phone)
    const currentRegistration = (context?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
    const recordId = currentRegistration?.lastCreatedRecordId ?? null
    const isEditMode = Boolean(currentRegistration?.editMode)

    if (!recordId) {
      if (isEditMode) {
        try {
          const draftPreparation = await this.prepareRecordUpdatesDraft({
            phone,
            updates,
            logContext,
          })

          if ('response' in draftPreparation) {
            return draftPreparation.response
          }

          if (draftPreparation.updatedDraft) {
            await this.updateCompletedDraftSnapshot(phone, draftPreparation.updatedDraft)
            return this.continueRegistration({ phone })
          }
        } catch (error) {
          await this.restoreCompletedDraftSnapshot(phone)
          const errorMessage = this.resolveEditErrorMessage(error)
          await sendWhatsAppMessage(phone, errorMessage)
          await this.onEditFailure(phone, null, error, logContext)
          return { error: errorMessage }
        }

        const failureMessage = this.options.messages.editFieldUpdateError ?? 'Não consegui alterar o campo informado.'
        await sendWhatsAppMessage(phone, failureMessage)
        return { error: failureMessage }
      }

      const message = this.options.messages.editRecordNotFound ?? 'Registro não encontrado.'
      await sendWhatsAppMessage(phone, message)
      return { error: 'Registro não encontrado' }
    }

    try {
      const draftPreparation = await this.prepareRecordUpdatesDraft({
        phone,
        updates,
        logContext,
      })

      if ('response' in draftPreparation) {
        return draftPreparation.response
      }

      const result = await this.finalizeEditOperation({
        phone,
        updatedDraft: draftPreparation.updatedDraft,
        updates,
        successMessage: successMessage ?? this.options.messages.editUpdateSuccess,
        logContext,
      })

      if ('error' in result) {
        return result
      }

      return this.buildResponse('Campo atualizado com sucesso', false, result.updatedDraft)
    } catch (error) {
      await this.restoreCompletedDraftSnapshot(phone)
      const errorMessage = this.resolveEditErrorMessage(error)
      await sendWhatsAppMessage(phone, errorMessage)
      await this.onEditFailure(phone, recordId, error, logContext)
      return { error: errorMessage }
    }
  }

  private async prepareRecordUpdatesDraft(args: { phone: string; updates: Partial<TUpsertArgs>; logContext?: string }): Promise<{ updatedDraft: TDraft } | { response: FlowResponse<TDraft> }> {
    const { phone, updates } = args

    await this.restoreCompletedDraftSnapshot(phone)

    const updatedDraft = await this.options.service.updateDraft(phone, updates)
    const preparedDraft = await this.afterDraftPrepared(phone, updatedDraft, {
      trigger: 'edit',
      updates,
    })
    const draft = preparedDraft.draft

    if (preparedDraft.response) {
      await this.options.service.saveDraft(phone, draft)
      return { response: preparedDraft.response }
    }

    const missingResult = await this.handleNextMissing(phone, draft, FlowStep.Editing)
    if (missingResult) {
      await this.options.service.saveDraft(phone, draft)
      await this.setUserContextWithFlowStep(
        phone,
        {
          editMode: true,
          type: this.options.flowType,
          status: 'collecting',
        },
        FlowStep.Editing,
      )
      return { response: missingResult }
    }

    return { updatedDraft: draft }
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
      const payloadPreview = this.options.service.previewPartialUpdatePayload(updatedDraft, updates)
      console.info(`[GenericCrudFlow:${this.options.flowType}] Persistindo edição de registro.`, {
        phone,
        recordId,
        updates,
        payloadPreview,
      })

      await this.options.service.update(phone, recordId, updatedDraft, updates)

      const summaryTitle = this.options.messages.buttonHeaderSuccess || 'Pronto!'
      const summary = await this.generateSummary(phone, updatedDraft, { title: summaryTitle, tone: 'success' })

      const completedDraft = { ...updatedDraft, status: 'completed' as const, recordId }
      await this.options.service.saveDraft(phone, completedDraft)

      const completedDraftSnapshot = JSON.parse(JSON.stringify(completedDraft))

      const currentRegistration = (getUserContextSync(phone)?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
      const currentSessionId = currentRegistration.sessionId

      await setUserContext(phone, {
        activeRegistration: {
          ...currentRegistration,
          type: undefined,
          status: 'completed',
          step: undefined,
          awaitingInputForField: undefined,
          pendingStep: undefined,
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
      const restoredDraft = await this.restoreCompletedDraftSnapshot(phone)

      console.error(`[GenericCrudFlow:${this.options.flowType}] Falha ao persistir edição de registro.`, {
        phone,
        recordId,
        updates,
        payloadPreview: this.options.service.previewPartialUpdatePayload(updatedDraft, updates),
        errorMessage,
        error,
      })

      await sendWhatsAppMessage(phone, errorMessage)

      try {
        const errorTitle = this.options.messages.buttonHeaderEdit || 'Ops!'
        const fallbackDraft = restoredDraft ?? updatedDraft
        const summary = await this.generateSummary(phone, fallbackDraft, { title: errorTitle, tone: 'error' })
        await this.sendEditDeleteOptionsAfterError(phone, fallbackDraft, summary, recordId, errorMessage)
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

  protected async generateSummary(phone: string, draft: TDraft, options?: { title?: string; maxLength?: 'short' | 'medium' | 'long'; tone?: 'success' | 'error' }): Promise<string> {
    if (this.options.messages.useNaturalLanguage) {
      try {
        return await this.options.service.buildDraftSummaryNatural(draft, phone, options)
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
    const currentRegistration = (getUserContextSync(phone)?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
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

  protected async handleNextMissing(phone: string, draft: TDraft, expectedStep?: FlowStep): Promise<FlowResponse<TDraft> | null> {
    const missing = await this.getMissingFields(draft)
    if (!missing.length) return null

    const field = missing[0]
    const handler = this.options.missingFieldHandlers[field]
    if (!handler) return null

    const currentRegistration = (getUserContextSync(phone)?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
    const resolvedStep = expectedStep ?? (currentRegistration.editMode ? FlowStep.Editing : FlowStep.Creating)

    await this.setAwaitingInputForField(phone, field as string, resolvedStep)

    return handler(phone, draft)
  }

  protected async presentConfirmation(phone: string, draft: TDraft): Promise<FlowResponse<TDraft>> {
    try {
      await this.beforeConfirmation(phone, draft)
      await this.prepareDraftForConfirmation(phone, draft)
      const summaryTitle = this.options.messages.buttonHeaderSuccess || 'Pronto!'
      const summary = await this.generateSummary(phone, draft, { title: summaryTitle, tone: 'success' })

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
      const recovered = await this.recoverFromCreateError(phone, draft, err)
      if (recovered) return recovered

      const userFacingMessage = this.options.service.handleServiceError(err)
      await sendWhatsAppMessage(phone, userFacingMessage)

      try {
        await this.finalizeFailedCreation(phone, draft)

        const errorTitle = this.options.messages.buttonHeaderEdit || 'Ops!'
        const summary = await this.generateSummary(phone, draft, { title: errorTitle, tone: 'error' })
        const recordId = draft?.recordId ?? null
        await this.sendEditCancelOptionsAfterCreationError(phone, draft, summary, userFacingMessage, recordId)
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

  protected async afterDraftPrepared(_phone: string, draft: TDraft, _context: DraftPreparationContext<TUpsertArgs>): Promise<DraftPreparationResult<TDraft>> {
    void _phone
    void _context
    return { draft }
  }

  protected async buildFreshDraftForRestartedCompletedSession(_phone: string, _updates?: Partial<TUpsertArgs>): Promise<TDraft | null> {
    void _phone
    void _updates
    return null
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

  protected abstract sendEditCancelOptionsAfterCreationError(phone: string, draft: TDraft, summary: string, errorMessage: string, recordId: string | null): Promise<void>

  protected async onCreateError(phone: string, _draft: TDraft, error: unknown, userMessage: string): Promise<void> {
    void _draft
    void error
    void userMessage

    await this.clearHistoryArtifactsAfterError(phone)
  }

  protected async recoverFromCreateError(_phone: string, _draft: TDraft, _error: unknown): Promise<FlowResponse<TDraft> | null> {
    void _phone
    void _draft
    void _error
    return null
  }

  private async clearHistoryArtifactsAfterError(phone: string): Promise<void> {
    try {
      await this.options.service.clearDraftHistory(phone)
    } catch (historyError) {
      console.error(`[GenericCrudFlow:${this.options.flowType}] Erro ao limpar histórico após falha de criação. (userId: ${phone})`, historyError)
    }

    try {
      await clearAllUserIntents(phone)
    } catch (intentError) {
      console.error(`[GenericCrudFlow:${this.options.flowType}] Erro ao limpar intent history após falha de criação. (userId: ${phone})`, intentError)
    }
  }

  private async finalizeSuccessfulCreation(phone: string, draft: TDraft, summary: string, recordId: string): Promise<TDraft> {
    const completedDraft = { ...draft, status: 'completed' as const, recordId } as TDraft
    const completedDraftSnapshot = JSON.parse(JSON.stringify(completedDraft)) as TDraft

    await this.options.service.saveDraft(phone, completedDraft)

    const currentRegistration = (getUserContextSync(phone)?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
    const currentSessionId = currentRegistration.sessionId

    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        type: undefined,
        status: 'completed',
        step: undefined,
        awaitingInputForField: undefined,
        pendingStep: undefined,
        editMode: undefined,
        lastCreatedRecordId: recordId,
        completedDraftSnapshot,
        snapshotSessionId: currentSessionId,
      },
    })

    await this.afterCreateSuccess(phone, completedDraft, summary)

    return completedDraft
  }

  private async finalizeFailedCreation(phone: string, draft: TDraft): Promise<void> {
    const completedDraft = { ...draft, status: 'completed' as const } as TDraft
    const completedDraftSnapshot = JSON.parse(JSON.stringify(completedDraft)) as TDraft

    await this.options.service.saveDraft(phone, completedDraft)

    const currentRegistration = (getUserContextSync(phone)?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
    const currentSessionId = currentRegistration.sessionId

    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        type: undefined,
        status: 'completed',
        step: undefined,
        awaitingInputForField: undefined,
        pendingStep: undefined,
        editMode: undefined,
        completedDraftSnapshot,
        snapshotSessionId: currentSessionId,
      },
    })
  }

  protected async restoreCompletedDraftSnapshot(phone: string): Promise<TDraft | null> {
    const registration = ((await getUserContext(phone))?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
    const snapshot = registration.completedDraftSnapshot
    if (!snapshot) return null
    const draftClone = JSON.parse(JSON.stringify(snapshot)) as TDraft
    await this.options.service.saveDraft(phone, draftClone)
    return draftClone
  }

  protected async updateCompletedDraftSnapshot(phone: string, draft: TDraft): Promise<void> {
    const currentRegistration = ((await getUserContext(phone))?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
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
    const currentRegistration = (getUserContextSync(phone)?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>

    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        editMode: true,
        type: this.options.flowType,
        step: FlowStep.Editing,
        status: 'collecting',
        awaitingInputForField: undefined,
        pendingStep: undefined,
      },
    })

    const introMessage = this.buildEditModeIntroMessage() || 'Me diga o que você quer alterar. Por exemplo: "mudar data para 20/03", "trocar o lote", etc.'
    await sendWhatsAppMessage(phone, introMessage)
  }

  protected async promptForDraftCorrection(phone: string): Promise<void> {
    const currentRegistration = (getUserContextSync(phone)?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>

    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        editMode: true,
        type: this.options.flowType,
        step: FlowStep.Editing,
        status: 'collecting',
        awaitingInputForField: undefined,
        pendingStep: undefined,
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

  private async resetCompletedDraftForNewSession(phone: string, currentRegistration: ActiveRegistrationState<TDraft>, updates?: Partial<TUpsertArgs>, sessionId?: string): Promise<void> {
    await this.options.service.clearDraft(phone)
    const newSessionId = sessionId ?? randomUUID()

    await setUserContext(phone, {
      activeRegistration: {
        ...currentRegistration,
        type: this.options.flowType,
        step: FlowStep.Creating,
        status: 'collecting',
        sessionId: newSessionId,
        completedDraftSnapshot: undefined,
        pendingStep: undefined,
        lastCreatedRecordId: undefined,
      },
    })

    const freshDraft = await this.buildFreshDraftForRestartedCompletedSession(phone, updates)
    if (freshDraft) {
      await this.options.service.saveDraft(phone, freshDraft)
      return
    }

    const emptyDraft = await this.options.service.loadDraft(phone)
    await this.options.service.saveDraft(phone, emptyDraft)
  }

  private async setAwaitingInputForField(phone: string, field: string, expectedStep?: FlowStep): Promise<void> {
    const step = expectedStep ?? FlowStep.Creating
    await this.setUserContextWithFlowStep(
      phone,
      {
        awaitingInputForField: field,
        pendingStep: {
          field,
          mode: step === FlowStep.Editing ? 'editing' : 'creating',
        },
        status: 'collecting',
      },
      step,
    )
  }

  private async clearAwaitingInputForField(phone: string): Promise<void> {
    const currentRegistration = (getUserContextSync(phone)?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>
    if (currentRegistration.awaitingInputForField === undefined) return
    await this.setUserContextWithFlowStep(
      phone,
      {
        awaitingInputForField: undefined,
        pendingStep: undefined,
      },
      currentRegistration.step ?? FlowStep.Creating,
    )
  }

  private async getMissingFields(draft: TDraft): Promise<TMissingField[]> {
    const rawMissing = await this.options.service.hasMissingFields(draft)

    return rawMissing.filter((field): field is TMissingField => {
      const handlers = this.options?.missingFieldHandlers
      return handlers != null && field in handlers
    })
  }

  protected async setUserContextWithFlowStep(phone: string, registration: Partial<ActiveRegistrationState<TDraft>>, forcedStep?: FlowStep, currentRegistrationNew?: ActiveRegistrationState<TDraft>): Promise<void> {
    const currentRegistration = currentRegistrationNew || ((getUserContextSync(phone)?.activeRegistration ?? {}) as ActiveRegistrationState<TDraft>)

    let step = forcedStep

    if (!step) {
      if (registration.editMode === true) {
        step = FlowStep.Editing
      } else if (currentRegistration.editMode === true) {
        step = FlowStep.Editing
      } else {
        const registrationStep = this.resolveFlowStep(registration.step)
        const currentStep = this.resolveFlowStep(currentRegistration.step)
        step = registrationStep ?? currentStep ?? FlowStep.Creating
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

  private resolveFlowStep(step?: unknown): FlowStep | undefined {
    if (typeof step !== 'string') return undefined
    const validSteps = Object.values(FlowStep) as string[]
    return validSteps.includes(step) ? (step as FlowStep) : undefined
  }

  protected async resetFlowSession(phone: string, reason = 'reset'): Promise<void> {
    const flowLabel = `[GenericCrudFlow:${this.options.flowType}]`

    try {
      await resetActiveRegistration(phone)
    } catch (error) {
      console.error(`${flowLabel} Erro ao resetar registro ativo. (userId: ${phone})`, error)
    }

    try {
      await this.options.service.clearDraft(phone)
    } catch (error) {
      console.error(`${flowLabel} Erro ao limpar rascunho. (userId: ${phone})`, error)
    }

    try {
      await this.options.service.clearDraftHistory(phone)
    } catch (error) {
      console.error(`${flowLabel} Erro ao limpar histórico de rascunho. (userId: ${phone})`, error)
    }

    try {
      await clearAllUserIntents(phone)
    } catch (error) {
      console.error(`${flowLabel} Erro ao limpar intent history. (userId: ${phone})`, error)
    }

    console.log(`${flowLabel} Sessão de cadastro limpa. Motivo: ${reason}. (userId: ${phone})`)
  }

  protected async ensureFlowAccess(phone: string, context?: UserRuntimeContext | null): Promise<FlowResponse<TDraft> | null> {
    const control = this.options.accessControl
    if (!control) return null

    const resolvedContext = context ?? getUserContextSync(phone)
    const planId = resolvedContext?.farmPlanId
    const subPlanIds = resolvedContext?.farmSubPlanIds ?? []
    const { allowedPlanIds, notAllowedSubPlansIds, deniedMessage } = control

    const planAllowed = !allowedPlanIds || allowedPlanIds.length === 0 || (planId !== undefined && planId !== null && allowedPlanIds.includes(planId))
    const subPlanNotAllowed = notAllowedSubPlansIds?.length ? subPlanIds.some((subPlanId: any) => notAllowedSubPlansIds.includes(subPlanId)) : false

    if (planAllowed && !subPlanNotAllowed) {
      return null
    }

    await this.resetFlowSession(phone, 'acesso negado')

    const message = deniedMessage || 'Desculpe, esta funcionalidade não está disponível para o seu plano atual.'
    await sendWhatsAppMessage(phone, message)
    return this.buildResponse(message, false)
  }
}
