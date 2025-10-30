import { FlowType } from '../../../enums/generic.enum'
import { saleFunctions } from '../../../functions/livestocks/selling/selling.functions'
import { sellingTools } from '../../../tools/livestocks/selling/selling.tools'
import { OpenAITool } from '../../../types/openai-types'
import { GenericContextService } from '../../context/generic.context'
import { ChatMessage } from '../../drafts/types'
import { FlowConfig } from '../../openai.config'
import { ISellingsValidationDraft } from './selling.types'
import { sellingService } from './sellingService'
import { registerSellingEditDeleteHandler } from '../../../interactives/selling/sellingInteractives'

export class SellingContextService extends GenericContextService<ISellingsValidationDraft> {
  private static instance: SellingContextService
  private serviceFunctions = {
    ...saleFunctions,
    editSellingsRecordField: saleFunctions.editSellingsRecordField,
  }
  private contextTools = [...sellingTools]
  protected flowType = FlowType.Selling

  private constructor() {
    super()
    registerSellingEditDeleteHandler()
  }

  protected getDraft = async (phone: string): Promise<ISellingsValidationDraft> => {
    return await sellingService.loadDraft(phone)
  }

  protected getDraftHistory = async (userId: string): Promise<ChatMessage[]> => {
    return await sellingService.getDraftHistory(userId)
  }

  protected getFlowConfig = (): Required<FlowConfig> => {
    return {
      allowedFunctions: ['startSellingRegistration', 'changeSaleRegistrationField', 'confirmSaleRegistration', 'cancelSaleRegistration', 'editSellingsRecordField', 'deleteSaleRegistration'],
      startFunction: 'startSellingRegistration',
      changeFunction: 'changeSaleRegistrationField',
      editFunction: 'editSellingsRecordField',
      cancelFunction: 'cancelSaleRegistration',
    }
  }

  protected getFunctionToCall = (functionName: string) => {
    return this.serviceFunctions[functionName as keyof typeof this.serviceFunctions]
  }

  protected getTools = async (): Promise<OpenAITool[]> => {
    return this.contextTools
  }

  static getInstance(): SellingContextService {
    if (!SellingContextService.instance) {
      SellingContextService.instance = new SellingContextService()
    }
    return SellingContextService.instance
  }
}

export const sellingContextService = SellingContextService.getInstance()
