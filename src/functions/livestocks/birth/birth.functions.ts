import { FlowType } from '../../../enums/generic.enum'
import { Plan, SubPlan } from '../../../enums/plans.enums'
import { sendConfirmationButtons, sendEditDeleteButtons, sendEditDeleteButtonsAfterError, sendEditCancelButtonsAfterCreationError } from '../../../interactives/genericConfirmation'
import { appendUserTextAuto } from '../../../services/history-router.service'
import { birthService } from '../../../services/livestocks/Birth/birthService'
import { BirthRecord, IBirthCreationPayload, IBirthValidationDraft, UpsertBirthArgs } from '../../../services/livestocks/Birth/birth.types'
import { GenericCrudFlow } from '../../generic/generic.flow'
import { BirthEditField, BirthMissingField, birthFieldEditors, missingFieldHandlers } from './birth.selects'
import { log } from 'console'
import { createHumanFlowMessages } from '../../../utils/conversation-copy'

class BirthFlowService extends GenericCrudFlow<IBirthValidationDraft, IBirthCreationPayload, BirthRecord, UpsertBirthArgs, BirthEditField, BirthMissingField> {
  private readonly confirmationNamespace = 'BIRTH_CONFIRMATION'
  private readonly editDeleteNamespace = 'BIRTH_EDIT_DELETE'
  private readonly editDeleteErrorNamespace = 'BIRTH_EDIT_DELETE_ERROR'
  private readonly editCancelCreationErrorNamespace = 'BIRTH_EDIT_CANCEL_CREATION_ERROR'

  constructor() {
    super({
      service: birthService,
      flowType: FlowType.Birth,
      fieldEditors: birthFieldEditors,
      missingFieldHandlers,
      messages: createHumanFlowMessages({
        confirmation: 'Se estiver tudo certo, posso confirmar esse nascimento?',
        creationSuccess: 'Pronto, esse nascimento foi registrado.',
        creationResponse: 'Perfeito, ja deixei esse registro salvo.',
        cancelSent: 'Tudo bem, parei esse cadastro por aqui.',
        cancelResponse: 'Certo, nao segui com esse cadastro.',
        missingDataDuringConfirm: 'Ainda falta um detalhe. Vou te pedir agora.',
        editModeIntro: 'Beleza. Me fala o que voce quer ajustar nesse registro.',
        editModeExamples: ['"Mudar a data"', '"Quantidade para 5"', '"Trocar a categoria"'],
        editRecordNotFound: 'Nao achei esse registro por aqui.',
        editUpdateSuccess: 'Pronto, atualizei esse registro.',
        deleteRecordNotFound: 'Nao achei esse registro para remover.',
        deleteSuccess: 'Pronto, esse registro foi removido.',
        deleteError: 'Nao consegui remover esse registro agora. Tenta de novo?',
        buttonHeaderSuccess: 'Registro salvo',
        useNaturalLanguage: false,
      }),
      accessControl: {
        allowedPlanIds: [Plan.BASIC, Plan.ADVANCED],
        notAllowedSubPlansIds: [SubPlan.INDIVIDUAL],
        deniedMessage: 'Esse plano ainda não tem essa funcionalidade.',
      },
    })
  }

  changeAnimalBirthRegistrationField = async (args: { phone: string; field: BirthEditField; value?: any }) => {
    const logContext = args.value !== undefined ? `Campo ${args.field} atualizado com valor ${JSON.stringify(args.value)}` : undefined
    return this.changeRegistrationWithValue({
      ...args,
      logContext,
    })
  }

  startAnimalBirthRegistration = async (args: { phone: string } & UpsertBirthArgs) => {
    return super.startRegistration(args)
  }

  continueAnimalBirthRegistration = async (args: { phone: string }) => {
    return super.continueRegistration(args)
  }

  confirmAnimalBirthRegistration = async (args: { phone: string }) => {
    return super.confirmRegistration(args)
  }

  cancelAnimalBirthRegistration = async (args: { phone: string }) => {
    return super.cancelRegistration(args)
  }

  protected async onFirstStart(phone: string, _draft: IBirthValidationDraft): Promise<void> {
    void _draft
    console.log(`[BirthFlow] O usuário iniciou um novo cadastro de nascimento. (userId: ${phone})`)
  }

  protected async beforeConfirmation(phone: string, draft: IBirthValidationDraft): Promise<void> {
    void phone
    void draft
    console.log(`[BirthFlow] O usuário está prestes a confirmar o cadastro de nascimento. (userId: ${phone})`)
  }

  protected async prepareDraftForConfirmation(phone: string, draft: IBirthValidationDraft): Promise<void> {
    await birthService.saveDraft(phone, draft)
  }

  protected async sendConfirmation(phone: string, draft: IBirthValidationDraft, summary: string): Promise<void> {
    await sendConfirmationButtons({
      namespace: this.confirmationNamespace,
      userId: phone,
      message: 'Se estiver tudo certo, posso confirmar esse nascimento?',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Agora nao',
      summaryText: summary,
      onConfirm: async (userId) => {
        await appendUserTextAuto(userId, 'Confirmar')
        await this.confirmAnimalBirthRegistration({ phone: userId })
      },
      onCancel: async (userId) => {
        await appendUserTextAuto(userId, 'Cancelar')
        await this.cancelAnimalBirthRegistration({ phone: userId })
      },
      loadDraft: birthService.loadDraft,
    })
  }

  protected async sendEditDeleteOptions(phone: string, _draft: IBirthValidationDraft, summary: string, _recordId: string): Promise<void> {
    await sendEditDeleteButtons({
      namespace: this.editDeleteNamespace,
      userId: phone,
      message: 'O que voce quer fazer agora?',
      editLabel: 'Editar',
      deleteLabel: 'Excluir',
      summaryText: summary,
      header: this.options.messages.buttonHeaderSuccess || 'Pronto!',
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editBirthRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Excluir')
        await this.deleteBirthRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditDeleteOptionsAfterError(phone: string, _draft: IBirthValidationDraft, summary: string, _recordId: string, errorMessage: string): Promise<void> {
    await sendEditDeleteButtonsAfterError({
      namespace: this.editDeleteErrorNamespace,
      userId: phone,
      message: 'O que voce quer fazer agora?',
      editLabel: 'Editar',
      deleteLabel: 'Excluir',
      summaryText: summary,
      header: this.options.messages.buttonHeaderEdit || 'Ops!',
      errorMessage,
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editBirthRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Excluir')
        await this.deleteBirthRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditCancelOptionsAfterCreationError(phone: string, _draft: IBirthValidationDraft, summary: string, errorMessage: string, recordId: string | null): Promise<void> {
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
        await appendUserTextAuto(userId, 'Cancelar cadastro')
        await this.cancelRegistration({ phone: userId })
      },
    })
  }

  async editBirthRegistration(args: { phone: string }): Promise<void> {
    await this.enterEditMode(args)
  }

  editBirthRecordField = async (args: { phone: string; field: BirthEditField; value?: any } & Partial<UpsertBirthArgs>) => {
    const { phone, field, value, ...rest } = args
    const providedValue = value ?? (rest as Record<string, any>)[field]
    if (providedValue !== undefined) {
      return this.applyBirthRecordUpdates({
        phone,
        updates: { [field]: providedValue } as Partial<UpsertBirthArgs>,
        logContext: `Campo ${field} atualizado com valor ${JSON.stringify(providedValue)}`,
      })
    }

    return this.editRecordField({
      phone,
      field,
      promptMessage: this.options.messages.editPromptFallback,
    })
  }

  applyBirthRecordUpdates = async (args: { phone: string; updates: Partial<UpsertBirthArgs>; successMessage?: string; logContext?: string }) => {
    return this.applyRecordUpdates(args)
  }

  async deleteBirthRegistration(args: { phone: string; confirmation?: boolean }): Promise<void> {
    await this.deleteRecord({ phone: args.phone })
  }

  async clearSession(args: { phone: string; reason?: string }) {
    const { phone, reason } = args || ({} as any)
    if (!phone) return

    const cleanupReason = reason ?? 'limpeza manual'
    await this.resetFlowSession(phone, cleanupReason)
    log(`[BirthFlow] Sessão de cadastro de nascimento limpa. Motivo: ${cleanupReason}. (userId: ${phone})`)
  }
  protected async onAfterCreateSuccess(phone: string, draft: IBirthValidationDraft, summary: string): Promise<void> {
    console.log(`[BirthFlow] O Usuário finalizou o cadastro de nascimento. (userId: ${phone})`)
  }

  protected override async afterEnterEditMode(phone: string, recordId: string, _draft: IBirthValidationDraft | null): Promise<void> {
    void _draft
    console.log(`[BirthFlow] O usuário entrou em modo de edição do registro ${recordId}. (userId: ${phone})`)
  }

  protected override async afterEditSuccess(phone: string, recordId: string, _updates: Partial<UpsertBirthArgs>, logContext?: string): Promise<void> {
    void _updates
    console.log(`[BirthFlow] ${logContext ?? 'Registro atualizado via edição.'} (registro ${recordId}, userId: ${phone})`)
  }

  protected override async onEditFailure(phone: string, recordId: string | null, error: unknown, logContext?: string): Promise<void> {
    const contextMessage = logContext ?? 'Erro ao atualizar registro em modo edição.'
    console.error(`[BirthFlow] ${contextMessage} (registro ${recordId ?? 'desconhecido'}, userId: ${phone})`, error)
  }

  protected override async afterDeleteSuccess(phone: string, recordId: string): Promise<void> {
    console.log(`[BirthFlow] O usuário excluiu o registro ${recordId}. (userId: ${phone})`)
  }

  protected override async onDeleteCleanupError(phone: string, recordId: string, step: 'clearDraft' | 'clearIntents', error: unknown): Promise<void> {
    const baseMessage = step === 'clearDraft' ? 'Erro ao limpar rascunho após exclusão.' : 'Erro ao limpar históricos após exclusão.'
    console.error(`[BirthFlow] ${baseMessage} (userId: ${phone})`, error)
  }

  protected override async onDeleteFailure(phone: string, recordId: string | null, error: unknown): Promise<void> {
    console.error(`[BirthFlow] Erro ao excluir registro ${recordId ?? 'desconhecido'}. (userId: ${phone})`, error)
  }

  protected async onCreateError(phone: string, draft: IBirthValidationDraft, error: unknown, userMessage: string): Promise<void> {
    await super.onCreateError(phone, draft, error, userMessage)

    void draft
    void userMessage
    console.error(`[BirthFlow] Ocorreu um erro ao criar o cadastro de nascimento. (userId: ${phone})`, error)
  }

  protected async onCancel(phone: string): Promise<void> {
    console.log(`[BirthFlow] O usuário cancelou o cadastro de nascimento. (userId: ${phone})`)
  }
}

export const birthFunctions = new BirthFlowService()
