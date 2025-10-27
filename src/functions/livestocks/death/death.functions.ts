import { clearDeathDraft } from '../../../services/livestocks/death-draft.service'
import { resetActiveRegistration } from '../../../env.config'
import { deathFieldEditors, missingFieldHandlers } from './death.selects'
import { FlowType } from '../../../enums/generic.enum'
import { DeathField } from '../../../enums/cruds/deathFields.enums'
import { DeathCreationPayload, deathDraftService, DeathFields, DeathRecord, DeathValidationDraft, UpsertArgs } from '../../../services/livestocks/death-draft.service'
import { GenericCrudFlow } from '../../generic/generic.flow'
import { sendDeathConfirmationButtons } from '../../../interactives/deathConfirmation'
import { Plan, SubPlan } from '../../../enums/plans.enums'
import { log } from 'console'
import { sendEditDeleteButtons, sendEditDeleteButtonsAfterError, sendEditCancelButtonsAfterCreationError } from '../../../interactives/genericConfirmation'
import { appendUserTextAuto } from '../../../services/history-router.service'

type DeathEditField = `${DeathField.Quantity}` | `${DeathField.DeathDate}` | `${DeathField.Age}` | `${DeathField.Category}` | `${DeathField.DeathCause}` | `${DeathField.AnimalLot}` | `${DeathField.Retreat}` | `${DeathField.Area}`

class DeathFlowService extends GenericCrudFlow<DeathValidationDraft, DeathCreationPayload, DeathRecord, UpsertArgs, DeathEditField, DeathFields> {
  private readonly editDeleteErrorNamespace = 'DEATH_EDIT_DELETE_ERROR'
  private readonly editCancelCreationErrorNamespace = 'DEATH_EDIT_CANCEL_CREATION_ERROR'

  constructor() {
    super({
      service: deathDraftService,
      flowType: FlowType.Death,
      fieldEditors: deathFieldEditors,
      missingFieldHandlers,
      messages: {
        confirmation: 'Confira o resumo e confirma pra mim?',
        creationSuccess: 'Morte registrada com sucesso!',
        creationResponse: 'Tudo certo, registro criado.',
        cancelSent: 'Beleza, cadastro cancelado.',
        cancelResponse: 'Operação cancelada.',
        missingDataDuringConfirm: 'Faltam alguns dados. Bora preencher?',
        invalidField: 'Esse campo não dá pra alterar pelo menu. Me manda uma mensagem com o novo valor.',
        editModeIntro: 'Bora editar o registro. Me diz o que você quer mudar.',
        editModeExamples: ['"Mudar quantidade pra 3"', '"Alterar a causa da morte"', '"Corrigir o lote"'],
        editRecordNotFound: 'Não achei o registro pra editar.',
        editFieldUpdateError: 'Não consegui alterar esse campo.',
        editPromptFallback: 'Qual a informação nova?',
        editDirectChangeSuccess: 'Dados atualizados.',
        editUpdateSuccess: 'Registro atualizado!',
        editUpdateError: 'Erro ao atualizar. Tenta de novo?',
        deleteRecordNotFound: 'Não achei o registro pra deletar.',
        deleteSuccess: 'Registro deletado com sucesso!',
        deleteError: 'Erro ao deletar. Tenta de novo?',
        buttonHeaderSuccess: 'Morte cadastrada!',
        useNaturalLanguage: true,
      },
      accessControl: {
        allowedPlanIds: [Plan.BASIC, Plan.ADVANCED],
        notAllowedSubPlansIds: [SubPlan.INDIVIDUAL],
        deniedMessage: 'Esse plano ainda não tem essa funcionalidade.',
      },
    })
  }

  changeAnimalDeathRegistrationField = async (args: { phone: string; field: DeathEditField; value?: any }) => {
    const logContext = args.value !== undefined ? `Campo ${args.field} atualizado com valor ${JSON.stringify(args.value)}` : undefined
    return this.changeRegistrationWithValue({
      ...args,
      logContext,
    })
  }

  startAnimalDeathRegistration = async (args: { phone: string } & UpsertArgs) => {
    return super.startRegistration(args)
  }

  continueAnimalDeathRegistration = async (args: { phone: string }) => {
    return super.continueRegistration(args)
  }

  confirmAnimalDeathRegistration = async (args: { phone: string }) => {
    return super.confirmRegistration(args)
  }

  cancelAnimalDeathRegistration = async (args: { phone: string }) => {
    return super.cancelRegistration(args)
  }

  protected async onFirstStart(phone: string, _draft: DeathValidationDraft): Promise<void> {
    void _draft
    log(`[DeathFlow] O Usuário iniciou um novo cadastro de morte. (userId: ${phone})`)
  }

  protected async beforeConfirmation(phone: string, draft: DeathValidationDraft): Promise<void> {
    void phone
    void draft
    console.log(`[DeathFlow] O usuário está prestes a confirmar o cadastro de morte. (userId: ${phone})`)
  }

  protected async prepareDraftForConfirmation(phone: string, draft: DeathValidationDraft): Promise<void> {
    await deathDraftService.saveDraft(phone, draft)
  }

  protected async sendConfirmation(phone: string, _draft: DeathValidationDraft, summary: string): Promise<void> {
    await sendDeathConfirmationButtons(phone, summary)
  }

  protected async sendEditDeleteOptions(phone: string, _draft: DeathValidationDraft, summary: string, _recordId: string): Promise<void> {
    const namespace = 'DEATH_EDIT_DELETE'

    await sendEditDeleteButtons({
      namespace,
      userId: phone,
      message: 'O que você quer fazer?',
      editLabel: 'Editar',
      deleteLabel: 'Deletar',
      summaryText: summary,
      header: this.options.messages.buttonHeaderSuccess || 'Pronto!',
      onEdit: async (userId) => {
        await appendUserTextAuto(userId, 'Editar')
        await this.editAnimalDeathRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Excluir')
        await this.deleteAnimalDeathRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditDeleteOptionsAfterError(phone: string, _draft: DeathValidationDraft, summary: string, _recordId: string, errorMessage: string): Promise<void> {
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
        await this.editAnimalDeathRegistration({ phone: userId })
      },
      onDelete: async (userId) => {
        await appendUserTextAuto(userId, 'Excluir')
        await this.deleteAnimalDeathRegistration({ phone: userId })
      },
    })
  }

  protected async sendEditCancelOptionsAfterCreationError(phone: string, _draft: DeathValidationDraft, summary: string, errorMessage: string): Promise<void> {
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

  editAnimalDeathRegistration = async (args: { phone: string }) => {
    return this.enterEditMode(args)
  }

  deleteAnimalDeathRegistration = async (args: { phone: string }) => {
    return this.deleteRecord(args)
  }

  editDeathRecordField = async (args: { phone: string; field: string; value?: any }) => {
    return this.editRecordField({
      ...args,
      promptMessage: this.options.messages.editPromptFallback,
    })
  }

  applyDeathRecordUpdates = async (args: { phone: string; updates: Partial<UpsertArgs>; successMessage?: string; logContext?: string }) => {
    return this.applyRecordUpdates(args)
  }

  async clearSession(args: { phone: string }) {
    const { phone } = args || ({} as any)
    await resetActiveRegistration(phone)
    await clearDeathDraft(phone)
    log(`[DeathFlow] O Usuário limpou a sessão de cadastro de morte. (userId: ${phone})`)
  }

  protected async onAfterCreateSuccess(phone: string, draft: DeathValidationDraft, summary: string): Promise<void> {
    log(`[DeathFlow] O Usuário finalizou o cadastro de morte. (userId: ${phone})`)
  }

  protected override async afterEnterEditMode(phone: string, recordId: string, _draft: DeathValidationDraft | null): Promise<void> {
    void _draft
    log(`[DeathFlow] O Usuário entrou em modo de edição do registro ${recordId}. (userId: ${phone})`)
  }

  protected override async afterEditSuccess(phone: string, recordId: string, _updates: Partial<UpsertArgs>, logContext?: string): Promise<void> {
    void _updates
    log(`[DeathFlow] ${logContext ?? 'Registro atualizado via edição.'} (registro ${recordId}, userId: ${phone})`)
  }

  protected override async onEditFailure(phone: string, recordId: string | null, error: unknown, logContext?: string): Promise<void> {
    const contextMessage = logContext ?? 'Erro ao atualizar registro em modo edição.'
    log(`[DeathFlow] ${contextMessage} (registro ${recordId ?? 'desconhecido'}, userId: ${phone})`, error)
  }

  protected override async afterDeleteSuccess(phone: string, recordId: string): Promise<void> {
    log(`[DeathFlow] O Usuário excluiu o registro ${recordId}. (userId: ${phone})`)
  }

  protected override async onDeleteCleanupError(phone: string, recordId: string, step: 'clearDraft' | 'clearIntents', error: unknown): Promise<void> {
    const baseMessage = step === 'clearDraft' ? 'Erro ao limpar rascunho após exclusão.' : 'Erro ao limpar históricos após exclusão.'
    console.error(`[DeathFlow] ${baseMessage} (userId: ${phone})`, error)
  }

  protected override async onDeleteFailure(phone: string, recordId: string | null, error: unknown): Promise<void> {
    log(`[DeathFlow] Erro ao excluir registro ${recordId ?? 'desconhecido'}. (userId: ${phone})`, error)
  }

  protected async onCreateError(phone: string, _draft: DeathValidationDraft, error: unknown, userMessage: string): Promise<void> {
    void _draft
    void userMessage
    log(`[DeathFlow] Ocorreu um erro ao criar o cadastro de morte. (userId: ${phone})`, error)
  }

  protected async onCancel(phone: string): Promise<void> {
    log(`[DeathFlow] O Usuário cancelou o cadastro de morte. (userId: ${phone})`)
  }
}

export const deathFunctions = new DeathFlowService()
