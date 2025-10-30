import { FlowType } from '../../../enums/generic.enum'
import { Plan, SubPlan } from '../../../enums/plans.enums'
import { sendConfirmationButtons, sendEditDeleteButtons, sendEditDeleteButtonsAfterError, sendEditCancelButtonsAfterCreationError } from '../../../interactives/genericConfirmation'
import { appendUserTextAuto } from '../../../services/history-router.service'
import { sellingService } from '../../../services/livestocks/Selling/sellingService'
import { SellingsRecord, ISellingsCreationPayload, ISellingsValidationDraft, UpsertSellingsArgs } from '../../../services/livestocks/Selling/selling.types'
import { GenericCrudFlow } from '../../generic/generic.flow'
import { SaleEditField, SaleMissingField, saleFieldEditors, missingFieldHandlers } from './selling.selects'
import { log } from 'console'

class SaleFlowService extends GenericCrudFlow<ISellingsValidationDraft, ISellingsCreationPayload, SellingsRecord, UpsertSellingsArgs, SaleEditField, SaleMissingField> {
  private readonly confirmationNamespace = 'SALE_CONFIRMATION'
  private readonly editDeleteNamespace = 'SALE_EDIT_DELETE'
  private readonly editDeleteErrorNamespace = 'SALE_EDIT_DELETE_ERROR'
  private readonly editCancelCreationErrorNamespace = 'SALE_EDIT_CANCEL_CREATION_ERROR'

  constructor() {
    super({
      service: sellingService,
      flowType: FlowType.Selling,
      fieldEditors: saleFieldEditors,
      missingFieldHandlers,
      messages: {
        confirmation: 'Confira o resumo e confirma pra mim?',
        creationSuccess: 'Venda registrada com sucesso!',
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
        buttonHeaderSuccess: 'Venda cadastrada!',
        useNaturalLanguage: false,
      },
      accessControl: {
        allowedPlanIds: [Plan.BASIC, Plan.ADVANCED],
        notAllowedSubPlansIds: [SubPlan.INDIVIDUAL],
        deniedMessage: 'Esse plano ainda não tem essa funcionalidade.',
      },
    })
  }

  changeSaleRegistrationField = async (args: { phone: string; field: SaleEditField; value?: any }) => {
    const logContext = args.value !== undefined ? `Campo ${args.field} atualizado com valor ${JSON.stringify(args.value)}` : undefined
    return this.changeRegistrationWithValue({
      ...args,
      logContext,
    })
  }

  startSellingRegistration = async (args: { phone: string } & UpsertSellingsArgs) => {
    return super.startRegistration(args)
  }

  continueSaleRegistration = async (args: { phone: string }) => {
    return super.continueRegistration(args)
  }

  confirmSaleRegistration = async (args: { phone: string }) => {
    return super.confirmRegistration(args)
  }

  cancelSaleRegistration = async (args: { phone: string }) => {
    return super.cancelRegistration(args)
  }

  protected async onFirstStart(phone: string, _draft: ISellingsValidationDraft): Promise<void> {
    void _draft
    console.log(`[SaleFlow] O usuário iniciou um novo cadastro de venda. (userId: ${phone})`)
  }

  protected async beforeConfirmation(phone: string, draft: ISellingsValidationDraft): Promise<void> {
    void phone
    void draft
    console.log(`[SaleFlow] O usuário está prestes a confirmar o cadastro de venda. (userId: ${phone})`)
  }

  protected async prepareDraftForConfirmation(phone: string, draft: ISellingsValidationDraft): Promise<void> {
    await sellingService.saveDraft(phone, draft)
  }

  protected async sendConfirmation(phone: string, draft: ISellingsValidationDraft, summary: string): Promise<void> {
    await sendConfirmationButtons({
      namespace: this.confirmationNamespace,
      userId: phone,
      message: 'Tudo pronto pra confirmar?',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
      summaryText: summary,
      onConfirm: async (userId) => {
        await appendUserTextAuto(userId, 'Confirmar')
        await this.confirmSaleRegistration({ phone: userId })
      },
      onCancel: async (userId) => {
        await appendUserTextAuto(userId, 'Cancelar')
        await this.cancelSaleRegistration({ phone: userId })
      },
      loadDraft: sellingService.loadDraft,
    })
  }

  protected async sendEditDeleteOptions(phone: string, _draft: ISellingsValidationDraft, summary: string, _recordId: string): Promise<void> {
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
        await this.editSaleRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Excluir')
        await this.deleteSaleRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditDeleteOptionsAfterError(phone: string, _draft: ISellingsValidationDraft, summary: string, _recordId: string, errorMessage: string): Promise<void> {
    await sendEditDeleteButtonsAfterError({
      namespace: this.editDeleteErrorNamespace,
      userId: phone,
      message: 'O que você quer fazer?',
      editLabel: 'Editar',
      deleteLabel: 'Deletar',
      summaryText: summary,
      header: this.options.messages.buttonHeaderEdit || 'Ops!',
      errorMessage,
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editSaleRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Excluir')
        await this.deleteSaleRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditCancelOptionsAfterCreationError(phone: string, _draft: ISellingsValidationDraft, summary: string, errorMessage: string, recordId: string | null): Promise<void> {
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
        await appendUserTextAuto(userId, 'Cancelar cadastro')
        await this.cancelRegistration({ phone: userId })
      },
    })
  }

  async editSaleRegistration(args: { phone: string }): Promise<void> {
    await this.enterEditMode(args)
  }

  editSellingsRecordField = async (args: { phone: string; field: SaleEditField; value?: any } & Partial<UpsertSellingsArgs>) => {
    const { phone, field, value, ...rest } = args
    const providedValue = value ?? (rest as Record<string, any>)[field]
    if (providedValue !== undefined) {
      return this.applySellingsRecordUpdates({
        phone,
        updates: { [field]: providedValue } as Partial<UpsertSellingsArgs>,
        logContext: `Campo ${field} atualizado com valor ${JSON.stringify(providedValue)}`,
      })
    }

    return this.editRecordField({
      phone,
      field,
      promptMessage: this.options.messages.editPromptFallback,
    })
  }

  applySellingsRecordUpdates = async (args: { phone: string; updates: Partial<UpsertSellingsArgs>; successMessage?: string; logContext?: string }) => {
    return this.applyRecordUpdates(args)
  }

  async deleteSaleRegistration(args: { phone: string; confirmation?: boolean }): Promise<void> {
    await this.deleteRecord({ phone: args.phone })
  }

  async clearSession(args: { phone: string; reason?: string }) {
    const { phone, reason } = args || ({} as any)
    if (!phone) return

    const cleanupReason = reason ?? 'limpeza manual'
    await this.resetFlowSession(phone, cleanupReason)
    log(`[SellingFlow] Sessão de cadastro de venda limpa. Motivo: ${cleanupReason}. (userId: ${phone})`)
  }

  protected async onAfterCreateSuccess(phone: string, draft: ISellingsValidationDraft, summary: string): Promise<void> {
    console.log(`[SaleFlow] O Usuário finalizou o cadastro de venda. (userId: ${phone})`)
  }

  protected override async afterEnterEditMode(phone: string, recordId: string, _draft: ISellingsValidationDraft | null): Promise<void> {
    void _draft
    console.log(`[SaleFlow] O usuário entrou em modo de edição do registro ${recordId}. (userId: ${phone})`)
  }

  protected override async afterEditSuccess(phone: string, recordId: string, _updates: Partial<UpsertSellingsArgs>, logContext?: string): Promise<void> {
    void _updates
    console.log(`[SaleFlow] ${logContext ?? 'Registro atualizado via edição.'} (registro ${recordId}, userId: ${phone})`)
  }

  protected override async onEditFailure(phone: string, recordId: string | null, error: unknown, logContext?: string): Promise<void> {
    const contextMessage = logContext ?? 'Erro ao atualizar registro em modo edição.'
    console.error(`[SaleFlow] ${contextMessage} (registro ${recordId ?? 'desconhecido'}, userId: ${phone})`, error)
  }

  protected override async afterDeleteSuccess(phone: string, recordId: string): Promise<void> {
    console.log(`[SaleFlow] O usuário excluiu o registro ${recordId}. (userId: ${phone})`)
  }

  protected override async onDeleteCleanupError(phone: string, recordId: string, step: 'clearDraft' | 'clearIntents', error: unknown): Promise<void> {
    const baseMessage = step === 'clearDraft' ? 'Erro ao limpar rascunho após exclusão.' : 'Erro ao limpar históricos após exclusão.'
    console.error(`[SaleFlow] ${baseMessage} (userId: ${phone})`, error)
  }

  protected override async onDeleteFailure(phone: string, recordId: string | null, error: unknown): Promise<void> {
    console.error(`[SaleFlow] Erro ao excluir registro ${recordId ?? 'desconhecido'}. (userId: ${phone})`, error)
  }

  protected async onCreateError(phone: string, draft: ISellingsValidationDraft, error: unknown, userMessage: string): Promise<void> {
    await super.onCreateError(phone, draft, error, userMessage)

    void draft
    void userMessage
    console.error(`[SaleFlow] Ocorreu um erro ao criar o cadastro de venda. (userId: ${phone})`, error)
  }

  protected async onCancel(phone: string): Promise<void> {
    console.log(`[SaleFlow] O usuário cancelou o cadastro de venda. (userId: ${phone})`)
  }
}

export const saleFunctions = new SaleFlowService()
