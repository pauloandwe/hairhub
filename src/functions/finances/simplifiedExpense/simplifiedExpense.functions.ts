import { log } from 'console'
import { FlowType } from '../../../enums/generic.enum'
import { Plan } from '../../../enums/plans.enums'
import { sendConfirmationButtons, sendEditDeleteButtons, sendEditDeleteButtonsAfterError, sendEditCancelButtonsAfterCreationError } from '../../../interactives/genericConfirmation'
import { SimpleExpenseRecord, SimplifiedExpenseCreationPayload, SimplifiedExpenseFields, SimplifiedExpenseRequiredFields, SimplifiedExpenseValidationDraft, UpsertSimplifiedExpenseArgs } from '../../../services/finances/simplifiedExpense/simplified-expense.types'
import { simplifiedExpenseService } from '../../../services/finances/simplifiedExpense/simplifiedExpenseService'
import { appendUserTextAuto } from '../../../services/history-router.service'
import { GenericCrudFlow } from '../../generic/generic.flow'
import { missingFieldHandlers, simplifiedExpenseEditors } from './simplifiedExpense.selects'

class SimplifiedExpenseFlowService extends GenericCrudFlow<SimplifiedExpenseValidationDraft, SimplifiedExpenseCreationPayload, SimpleExpenseRecord, UpsertSimplifiedExpenseArgs, SimplifiedExpenseFields, SimplifiedExpenseRequiredFields> {
  private readonly confirmationNamespace = 'SIMPLEFIED_EXPENSE_CONFIRM_NAMESPACE'
  private readonly editDeleteErrorNamespace = 'SIMPLIFIED_EXPENSE_EDIT_DELETE_ERROR'
  private readonly editCancelCreationErrorNamespace = 'SIMPLIFIED_EXPENSE_EDIT_CANCEL_CREATION_ERROR'

  constructor() {
    super({
      service: simplifiedExpenseService,
      flowType: FlowType.SimplifiedExpense,
      fieldEditors: simplifiedExpenseEditors,
      missingFieldHandlers,
      messages: {
        confirmation: 'Confira o resumo para confirmar.',
        creationSuccess: 'Registro de despesa simples criado com sucesso.',
        creationResponse: 'Registro criado e rascunho limpo.',
        cancelSent: 'Cadastro e rascunho de despesa foram limpos com sucesso.',
        cancelResponse: 'Cancelado.',
        missingDataDuringConfirm: 'Ainda faltam dados obrigatórios. Vamos preencher agora.',
        invalidField: 'Campo inválido para alteração. Me diga exatamente qual informação você quer alterar.',
        editModeIntro: 'Você está editando o registro. Me diga o que deseja alterar.',
        editModeExamples: ['"Mudar valor para 500"', '"Alterar fornecedor"', '"Corrigir descrição"'],
        editRecordNotFound: 'Não foi possível encontrar o registro para editar.',
        editFieldUpdateError: 'Não consegui alterar o campo informado.',
        editPromptFallback: 'Qual o novo valor?',
        editDirectChangeSuccess: 'Dados alterados com sucesso.',
        editUpdateSuccess: 'Registro editado com sucesso.',
        editUpdateError: 'Erro ao atualizar o registro.',
        deleteRecordNotFound: 'Não foi possível encontrar o registro para excluir.',
        deleteSuccess: 'Registro excluído com sucesso!',
        deleteError: 'Erro ao excluir o registro. Por favor, tente novamente.',
        buttonHeaderSuccess: 'Despesa cadastrada!',
        useNaturalLanguage: true,
      },
      accessControl: {
        allowedPlanIds: [Plan.BASIC],
        deniedMessage: 'Desculpe, ainda não há suporte para o plano Inttegra +.',
      },
    })
  }

  startExpenseRegistration = async (args: { phone: string } & Partial<UpsertSimplifiedExpenseArgs>) => {
    return super.startRegistration(args)
  }

  continueExpenseRegistration = async (args: { phone: string }) => {
    return super.continueRegistration(args)
  }

  confirmSimpleExpenseRegistration = async (args: { phone: string }) => {
    return super.confirmRegistration(args)
  }

  cancelSimplifiedExpenseRegistration = async (args: { phone: string }) => {
    return super.cancelRegistration(args)
  }

  changeSimplifiedExpenseRegistration = async (args: { phone: string; field: SimplifiedExpenseFields; value?: any }) => {
    const logContext = args.value !== undefined ? `Campo ${args.field} atualizado com valor ${JSON.stringify(args.value)}` : undefined
    return this.changeRegistrationWithValue({
      ...args,
      logContext,
    })
  }

  protected async sendConfirmation(phone: string, _draft: SimplifiedExpenseValidationDraft, summary: string): Promise<void> {
    await sendConfirmationButtons({
      namespace: this.confirmationNamespace,
      userId: phone,
      message: 'Confirmar o cadastro?',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
      summaryText: summary,
      onConfirm: async (userId) => {
        await appendUserTextAuto(userId, 'Confirmar')
        await this.confirmSimpleExpenseRegistration({ phone: userId })
      },
      onCancel: async (userId) => {
        await appendUserTextAuto(userId, 'Cancelar')
        await this.cancelSimplifiedExpenseRegistration({ phone: userId })
      },
      loadDraft: simplifiedExpenseService.loadDraft,
    })
  }

  protected async sendEditDeleteOptions(phone: string, _draft: SimplifiedExpenseValidationDraft, summary: string, _recordId: string): Promise<void> {
    const namespace = 'SIMPLIFIED_EXPENSE_EDIT_DELETE'

    await sendEditDeleteButtons({
      namespace,
      userId: phone,
      message: 'O que deseja fazer?',
      editLabel: 'Editar',
      deleteLabel: 'Excluir',
      summaryText: summary,
      header: this.options.messages.buttonHeaderSuccess || 'Pronto!',
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editSimplifiedExpenseRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Excluir')
        await this.deleteSimplifiedExpenseRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditDeleteOptionsAfterError(phone: string, _draft: SimplifiedExpenseValidationDraft, summary: string, _recordId: string, errorMessage: string): Promise<void> {
    await sendEditDeleteButtonsAfterError({
      namespace: this.editDeleteErrorNamespace,
      userId: phone,
      message: 'O que deseja fazer?',
      editLabel: 'Editar',
      deleteLabel: 'Excluir',
      summaryText: summary,
      header: this.options.messages.buttonHeaderEdit || 'Ops!',
      errorMessage,
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editSimplifiedExpenseRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Excluir')
        await this.deleteSimplifiedExpenseRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditCancelOptionsAfterCreationError(phone: string, _draft: SimplifiedExpenseValidationDraft, summary: string, errorMessage: string): Promise<void> {
    await sendEditCancelButtonsAfterCreationError({
      namespace: `${this.editCancelCreationErrorNamespace}_${Date.now()}`,
      userId: phone,
      message: 'O que você quer fazer?',
      editLabel: '✏️ Editar',
      cancelLabel: '❌ Cancelar',
      summaryText: summary,
      header: this.options.messages.buttonHeaderEdit || 'Ops!',
      errorMessage,
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar dados')
        await this.promptForDraftEdit(userId)
      },
      onCancel: async (userId) => {
        await appendUserTextAuto(userId, 'Cancelar cadastro')
        await this.cancelRegistration({ phone: userId })
      },
    })
  }

  editSimplifiedExpenseRegistration = async (args: { phone: string }) => {
    return this.enterEditMode(args)
  }

  deleteSimplifiedExpenseRegistration = async (args: { phone: string }) => {
    return this.deleteRecord(args)
  }

  editExpenseRecordField = async (args: { phone: string; field: string; value?: any }) => {
    return this.editRecordField({
      ...args,
      promptMessage: this.options.messages.editPromptFallback,
    })
  }

  applyExpenseRecordUpdates = async (args: { phone: string; updates: Partial<UpsertSimplifiedExpenseArgs>; successMessage?: string; logContext?: string }) => {
    return this.applyRecordUpdates(args)
  }

  protected async onFirstStart(phone: string, _draft: SimplifiedExpenseValidationDraft): Promise<void> {
    void _draft
    console.log(`[SimplifiedExpenseFlow] O Usuário iniciou um novo cadastro de despesa. (userId: ${phone})`)
  }

  protected async beforeConfirmation(phone: string, draft: SimplifiedExpenseValidationDraft): Promise<void> {
    void phone
    void draft
    console.log(`[SimplifiedExpenseFlow] O usuário está prestes a confirmar o cadastro de despesa. (userId: ${phone})`)
  }

  protected async prepareDraftForConfirmation(phone: string, draft: SimplifiedExpenseValidationDraft): Promise<void> {
    await simplifiedExpenseService.saveDraft(phone, draft)
  }

  protected async afterCreateSuccess(phone: string, draft: SimplifiedExpenseValidationDraft, summary: string): Promise<void> {
    await super.afterCreateSuccess(phone, draft, summary)
  }

  protected async onAfterCreateSuccess(phone: string): Promise<void> {
    log(`[SimplifiedExpenseFlow] Registro de despesa simples criado com sucesso. (userId: ${phone})`)
  }

  protected async onCreateError(phone: string, error: unknown): Promise<void> {
    log(`[SimplifiedExpenseFlow] Erro ao criar registro de despesa simples. (userId: ${phone})`, error)
  }

  protected async onCancel(phone: string): Promise<void> {
    log(`[SimplifiedExpenseFlow] O Usuário cancelou o cadastro de despesa simples. (userId: ${phone})`)
  }

  protected override async afterEnterEditMode(phone: string, recordId: string, _draft: SimplifiedExpenseValidationDraft | null): Promise<void> {
    void _draft
    log(`[SimplifiedExpenseFlow] O Usuário entrou em modo de edição do registro ${recordId}. (userId: ${phone})`)
  }

  protected override async afterEditSuccess(phone: string, recordId: string, _updates: Partial<UpsertSimplifiedExpenseArgs>, logContext?: string): Promise<void> {
    void _updates
    log(`[SimplifiedExpenseFlow] ${logContext ?? 'Registro atualizado via edição.'} (registro ${recordId}, userId: ${phone})`)
  }

  protected override async onEditFailure(phone: string, recordId: string | null, error: unknown, logContext?: string): Promise<void> {
    const contextMessage = logContext ?? 'Erro ao atualizar registro em modo edição.'
    log(`[SimplifiedExpenseFlow] ${contextMessage} (registro ${recordId ?? 'desconhecido'}, userId: ${phone})`, error)
  }

  protected override async afterDeleteSuccess(phone: string, recordId: string): Promise<void> {
    log(`[SimplifiedExpenseFlow] O Usuário excluiu o registro ${recordId}. (userId: ${phone})`)
  }

  protected override async onDeleteCleanupError(phone: string, recordId: string, step: 'clearDraft' | 'clearIntents', error: unknown): Promise<void> {
    const baseMessage = step === 'clearDraft' ? 'Erro ao limpar rascunho após exclusão.' : 'Erro ao limpar históricos após exclusão.'
    console.error(`[SimplifiedExpenseFlow] ${baseMessage} (userId: ${phone})`, error)
  }

  protected override async onDeleteFailure(phone: string, recordId: string | null, error: unknown): Promise<void> {
    log(`[SimplifiedExpenseFlow] Erro ao excluir registro ${recordId ?? 'desconhecido'}. (userId: ${phone})`, error)
  }
}

export const simplifiedExpenseFunctions = new SimplifiedExpenseFlowService()
