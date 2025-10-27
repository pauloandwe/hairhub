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

export class SimplifiedExpenseContextService extends GenericContextService<SimplifiedExpenseValidationDraft> {
  private static instance: SimplifiedExpenseContextService
  private serviceFunctions = {
    ...simplifiedExpenseFunctions,
    editExpenseRecordField: simplifiedExpenseFunctions.editExpenseRecordField,
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

  static getInstance(): SimplifiedExpenseContextService {
    if (!SimplifiedExpenseContextService.instance) {
      SimplifiedExpenseContextService.instance = new SimplifiedExpenseContextService()
    }
    return SimplifiedExpenseContextService.instance
  }
}
