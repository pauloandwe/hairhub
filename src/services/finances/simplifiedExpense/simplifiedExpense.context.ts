import { sendWhatsAppMessage } from '../../../api/meta.api'
import { FlowType } from '../../../enums/generic.enum'
import { simplifiedExpenseFunctions } from '../../../functions/finances/simplifiedExpense/simplifiedExpense.functions'
import { expenseTools } from '../../../tools/finances/simplifiedExpense.tools'
import { OpenAITool } from '../../../types/openai-types'
import { GenericContextService } from '../../context/generic.context'
import { ChatMessage } from '../../drafts/types'
import { FlowConfig } from '../../openai.config'
import { SimplifiedExpenseValidationDraft } from './simplified-expense.types'
import { simplifiedExpenseService } from './simplifiedExpenseService'
import { registerSimplifiedExpenseEditDeleteHandler } from '../../../interactives/finances/simplifiedExpenseInteractives'
import { setUserContext } from '../../../env.config'
import { sendCostCenterSelectionList } from '../../../interactives/finances/costCenterSelection'

export class SimplifiedExpenseContextService extends GenericContextService<SimplifiedExpenseValidationDraft> {
  private static instance: SimplifiedExpenseContextService
  private serviceFunctions = {
    ...simplifiedExpenseFunctions,
    editExpenseRecordField: simplifiedExpenseFunctions.editExpenseRecordField,
    searchCostCenter: simplifiedExpenseFunctions.searchCostCenter,
  }
  private contextTools = [...expenseTools]
  protected flowType = FlowType.SimplifiedExpense
  private constructor() {
    super()
    registerSimplifiedExpenseEditDeleteHandler()
  }

  protected getDraft = async (phone: string): Promise<SimplifiedExpenseValidationDraft> => {
    return await simplifiedExpenseService.loadDraft(phone)
  }

  protected getDraftHistory = async (userId: string): Promise<ChatMessage[]> => {
    return await simplifiedExpenseService.getDraftHistory(userId)
  }

  protected getFlowConfig = (): Required<FlowConfig> => {
    return {
      allowedFunctions: ['startExpenseRegistration', 'changeSimplifiedExpenseRegistration', 'confirmSimpleExpenseRegistration', 'cancelSimplifiedExpenseRegistration', 'editExpenseRecordField'],
      startFunction: 'startExpenseRegistration',
      changeFunction: 'changeSimplifiedExpenseRegistration',
      editFunction: 'editExpenseRecordField',
      cancelFunction: 'cancelSimplifiedExpenseRegistration',
    }
  }

  protected getFunctionToCall = (functionName: string) => {
    return this.serviceFunctions[functionName as keyof typeof this.serviceFunctions]
  }

  protected getTools = async (): Promise<OpenAITool[]> => {
    return this.contextTools
  }

  async handleCostCenterSearchQuery(userId: string, incomingMessage: string): Promise<void> {
    const query = incomingMessage.trim()

    if (!query) {
      await sendWhatsAppMessage(userId, 'Não entendi. Informe o índice ou parte do nome do centro de custo para pesquisar.')
      return
    }

    try {
      const results = await simplifiedExpenseService.searchCostCenters(userId, query)

      if (results.length === 0) {
        await sendWhatsAppMessage(userId, `Não encontrei centros de custo para "${query}". Tente outro nome ou índice.`)
        return
      }

      await sendCostCenterSelectionList(userId, `Encontrei ${results.length} centro(s) de custo para "${query}". Selecione uma opção:`, 0, results)
      await setUserContext(userId, {
        costCenterSearch: {
          awaitingQuery: false,
          lastQuery: query,
        },
      })
    } catch (error) {
      console.error('[SimplifiedExpenseContext] Erro durante busca de centros de custo:', error)
      await sendWhatsAppMessage(userId, 'Não consegui buscar os centros de custo agora. Tente novamente em instantes.')
    }
  }

  static getInstance(): SimplifiedExpenseContextService {
    if (!SimplifiedExpenseContextService.instance) {
      SimplifiedExpenseContextService.instance = new SimplifiedExpenseContextService()
    }
    return SimplifiedExpenseContextService.instance
  }
}
