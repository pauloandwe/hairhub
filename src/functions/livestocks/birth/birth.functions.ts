import { FlowType } from '../../../enums/generic.enum'
import { Plan, SubPlan } from '../../../enums/plans.enums'
import { resetActiveRegistration } from '../../../env.config'
import { sendConfirmationButtons, sendEditDeleteButtons, sendEditDeleteButtonsAfterError, sendEditCancelButtonsAfterCreationError } from '../../../interactives/genericConfirmation'
import { appendUserTextAuto } from '../../../services/history-router.service'
import { birthService } from '../../../services/livestocks/Birth/birthService'
import { BirthRecord, IBirthCreationPayload, IBirthValidationDraft, UpsertBirthArgs } from '../../../services/livestocks/Birth/birth.types'
import { GenericCrudFlow } from '../../generic/generic.flow'
import { BirthEditField, BirthMissingField, birthFieldEditors, missingFieldHandlers } from './birth.selects'

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
      messages: {
        confirmation: 'Confira o resumo e confirma pra mim?',
        creationSuccess: 'Nascimento registrado com sucesso!',
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
        buttonHeaderSuccess: 'Nascimento cadastrado!',
        useNaturalLanguage: true,
      },
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
      message: 'Tudo pronto pra confirmar?',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
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
      message: 'O que você quer fazer?',
      editLabel: 'Editar',
      deleteLabel: 'Deletar',
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
      message: 'O que você quer fazer?',
      editLabel: 'Editar',
      deleteLabel: 'Deletar',
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

  protected async sendEditCancelOptionsAfterCreationError(phone: string, _draft: IBirthValidationDraft, summary: string, errorMessage: string): Promise<void> {
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

  async clearSession(args: { phone: string }) {
    const { phone } = args || ({} as any)
    await resetActiveRegistration(phone)
    await birthService.clearDraft(phone)
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

  protected async onCreateError(phone: string, _draft: IBirthValidationDraft, error: unknown, userMessage: string): Promise<void> {
    void _draft
    void userMessage
    console.error(`[BirthFlow] Ocorreu um erro ao criar o cadastro de nascimento. (userId: ${phone})`, error)
  }

  protected async onCancel(phone: string): Promise<void> {
    console.log(`[BirthFlow] O usuário cancelou o cadastro de nascimento. (userId: ${phone})`)
  }
}

export const birthFunctions = new BirthFlowService()
