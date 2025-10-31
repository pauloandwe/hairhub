import { log } from 'console'
import { FlowType } from '../../../enums/generic.enum'
import { Plan, SubPlan } from '../../../enums/plans.enums'
import { sendConfirmationButtons, sendEditCancelButtonsAfterCreationError, sendEditDeleteButtons, sendEditDeleteButtonsAfterError } from '../../../interactives/genericConfirmation'
import { appendUserTextAuto } from '../../../services/history-router.service'
import { IPurchaseCreationPayload, IPurchaseValidationDraft, PurchaseEditField, PurchaseMissingField, PurchaseRecord, UpsertPurchaseArgs } from '../../../services/livestocks/Purchase/purchase.types'
import { purchaseService } from '../../../services/livestocks/Purchase/purchaseService'
import { GenericCrudFlow } from '../../generic/generic.flow'
import { purchaseFieldEditors, missingFieldHandlers } from './purchase.selects'

class PurchaseFlowService extends GenericCrudFlow<IPurchaseValidationDraft, IPurchaseCreationPayload, PurchaseRecord, UpsertPurchaseArgs, PurchaseEditField, PurchaseMissingField> {
  private readonly confirmationNamespace = 'PURCHASE_CONFIRMATION'
  private readonly editDeleteNamespace = 'PURCHASE_EDIT_DELETE'
  private readonly editDeleteErrorNamespace = 'PURCHASE_EDIT_DELETE_ERROR'
  private readonly editCancelCreationErrorNamespace = 'PURCHASE_EDIT_CANCEL_CREATION_ERROR'

  constructor() {
    super({
      service: purchaseService,
      flowType: FlowType.Purchase,
      fieldEditors: purchaseFieldEditors,
      missingFieldHandlers,
      messages: {
        confirmation: 'Confirma o resumo e confirma pra mim?',
        creationSuccess: 'Compra registrada com sucesso!',
        creationResponse: 'Tudo certo, registro criado.',
        cancelSent: 'Beleza, cadastro cancelado.',
        cancelResponse: 'Operação cancelada.',
        missingDataDuringConfirm: 'Faltam alguns dados. Bora preencher?',
        invalidField: 'Esse campo não dá pra alterar pelo menu. Me manda uma mensagem com o novo valor.',
        editModeIntro: 'Bora editar o registro. Me diz o que você quer mudar.',
        editModeExamples: ['"Mudar data para 20/03/2024"', '"Quantidade pra 5"', '"Trocar a categoria"'],
        editRecordNotFound: 'Não achei o registro pra editar.',
        editFieldUpdateError: 'Não consegui alterar esse campo.',
        editPromptFallback: 'Qual a informação nova?',
        editDirectChangeSuccess: 'Dados atualizados.',
        editUpdateSuccess: 'Registro atualizado!',
        editUpdateError: 'Erro ao atualizar. Tenta de novo?',
        deleteRecordNotFound: 'Não achei o registro pra deletar.',
        deleteSuccess: 'Registro deletado com sucesso!',
        deleteError: 'Erro ao deletar. Tenta de novo?',
      },
      accessControl: {
        allowedPlanIds: [Plan.BASIC, Plan.ADVANCED],
        notAllowedSubPlansIds: [SubPlan.INDIVIDUAL],
        deniedMessage: 'Esse plano ainda não tem essa funcionalidade.',
      },
    })
  }

  changePurchaseRegistrationField = async (args: { phone: string; field: PurchaseEditField; value?: any }) => {
    const logContext = args.value !== undefined ? `Campo ${args.field} atualizado com valor ${JSON.stringify(args.value)}` : undefined
    return this.changeRegistrationWithValue({
      ...args,
      logContext,
    })
  }

  startPurchaseRegistration = async (args: { phone: string } & UpsertPurchaseArgs) => {
    return super.startRegistration(args)
  }

  continuePurchaseRegistration = async (args: { phone: string }) => {
    return super.continueRegistration(args)
  }

  confirmPurchaseRegistration = async (args: { phone: string }) => {
    return super.confirmRegistration(args)
  }

  cancelPurchaseRegistration = async (args: { phone: string }) => {
    return super.cancelRegistration(args)
  }

  protected async onFirstStart(phone: string, _draft: IPurchaseValidationDraft): Promise<void> {
    void _draft
  }

  protected async beforeConfirmation(phone: string, draft: IPurchaseValidationDraft): Promise<void> {
    void phone
    void draft
  }

  protected async prepareDraftForConfirmation(phone: string, draft: IPurchaseValidationDraft): Promise<void> {
    await purchaseService.saveDraft(phone, draft)
  }

  protected async sendConfirmation(phone: string, draft: IPurchaseValidationDraft, summary: string): Promise<void> {
    await sendConfirmationButtons({
      namespace: this.confirmationNamespace,
      userId: phone,
      message: 'Tudo pronto pra confirmar?',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
      summaryText: summary,
      onConfirm: async (userId) => {
        await appendUserTextAuto(userId, 'Confirmar')
        await this.confirmPurchaseRegistration({ phone: userId })
      },
      onCancel: async (userId) => {
        await appendUserTextAuto(userId, 'Cancelar')
        await this.cancelPurchaseRegistration({ phone: userId })
      },
      loadDraft: purchaseService.loadDraft,
    })
  }

  protected async sendEditDeleteOptions(phone: string, _draft: IPurchaseValidationDraft, summary: string, _recordId: string): Promise<void> {
    await sendEditDeleteButtons({
      namespace: this.editDeleteNamespace,
      userId: phone,
      message: 'O que você quer fazer?',
      editLabel: 'Editar',
      deleteLabel: 'Deletar',
      summaryText: summary,
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editPurchaseRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Excluir')
        await this.deletePurchaseRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditDeleteOptionsAfterError(phone: string, _draft: IPurchaseValidationDraft, summary: string, _recordId: string, errorMessage: string): Promise<void> {
    await sendEditDeleteButtonsAfterError({
      namespace: this.editDeleteErrorNamespace,
      userId: phone,
      message: 'O que você quer fazer?',
      editLabel: 'Editar',
      deleteLabel: 'Deletar',
      summaryText: summary,
      errorMessage,
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editPurchaseRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Excluir')
        await this.deletePurchaseRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditCancelOptionsAfterCreationError(phone: string, draft: IPurchaseValidationDraft, summary: string, errorMessage: string): Promise<void> {
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
        await this.promptForDraftEdit(userId)
      },
      onCancel: async (userId) => {
        await appendUserTextAuto(userId, 'Cancelar cadastro')
        await this.cancelRegistration({ phone: userId })
      },
    })
  }

  async editPurchaseRegistration(args: { phone: string }): Promise<void> {
    await this.enterEditMode(args)
  }

  editPurchaseRecordField = async (args: { phone: string; field: string; value?: any }) => {
    const { phone, field, value, ...rest } = args
    const providedValue = value ?? (rest as Record<string, any>)[field]
    if (providedValue !== undefined) {
      return this.applyPurchaseRecordUpdates({
        phone,
        updates: { [field]: providedValue } as Partial<UpsertPurchaseArgs>,
        logContext: `Campo ${field} atualizado com valor ${JSON.stringify(providedValue)}`,
      })
    }

    return this.editRecordField({
      phone,
      field,
      promptMessage: this.options.messages.editPromptFallback,
    })
  }

  applyPurchaseRecordUpdates = async (args: { phone: string; updates: Partial<UpsertPurchaseArgs>; successMessage?: string; logContext?: string }) => {
    return this.applyRecordUpdates(args)
  }

  deletePurchaseRegistration = async (args: { phone: string; confirmation?: boolean }) => {
    return this.deleteRecord({ phone: args.phone })
  }

  async clearSession(args: { phone: string; reason?: string }) {
    const { phone, reason } = args || ({} as any)
    if (!phone) return

    const cleanupReason = reason ?? 'limpeza manual'
    await this.resetFlowSession(phone, cleanupReason)
    log(`[PurchaseFlow] Sessão de cadastro de compra limpa. Motivo: ${cleanupReason}. (userId: ${phone})`)
  }
  protected async onAfterCreateSuccess(_phone: string, draft: IPurchaseValidationDraft, _summary: string): Promise<void> {
    void draft
  }

  protected override async afterEnterEditMode(phone: string, recordId: string, _draft: IPurchaseValidationDraft | null): Promise<void> {
    void _draft
  }

  protected override async afterEditSuccess(phone: string, recordId: string, _updates: Partial<UpsertPurchaseArgs>, logContext?: string): Promise<void> {
    void _updates
  }

  protected override async onEditFailure(phone: string, recordId: string | null, error: unknown, logContext?: string): Promise<void> {
    const contextMessage = logContext ?? 'Erro ao atualizar registro em modo edição.'
  }

  protected override async afterDeleteSuccess(phone: string, recordId: string): Promise<void> {
    void recordId
  }

  protected override async onDeleteCleanupError(phone: string, recordId: string, step: 'clearDraft' | 'clearIntents', error: unknown): Promise<void> {
    const baseMessage = step === 'clearDraft' ? 'Erro ao limpar rascunho após exclusão.' : 'Erro ao limpar históricos após exclusão.'
    console.error(`[PurchaseFlow] ${baseMessage} (userId: ${phone})`, error)
  }

  protected override async onDeleteFailure(phone: string, recordId: string | null, error: unknown): Promise<void> {
    console.error(`[PurchaseFlow] Erro ao excluir registro ${recordId ?? 'desconhecido'}. (userId: ${phone})`, error)
  }

  protected async onCreateError(phone: string, draft: IPurchaseValidationDraft, error: unknown, userMessage: string): Promise<void> {
    await super.onCreateError(phone, draft, error, userMessage)

    void draft
    void userMessage
    console.error(`[PurchaseFlow] Ocorreu um erro ao criar o cadastro de compra. (userId: ${phone})`, error)
  }

  protected async onCancel(phone: string): Promise<void> {
    console.log(`[PurchaseFlow] O usuário cancelou o cadastro de compra. (userId: ${phone})`)
  }
}

export const purchaseFunctions = new PurchaseFlowService()
