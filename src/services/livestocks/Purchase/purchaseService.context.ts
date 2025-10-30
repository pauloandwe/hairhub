import { FlowType } from '../../../enums/generic.enum'
import { purchaseFunctions } from '../../../functions/livestocks/purchase/purchase.functions'
import { registerPurchaseEditDeleteHandler } from '../../../interactives/purchase/purchaseInteractives'
import { purchaseTools } from '../../../tools/livestocks/purchase/purchase.tools'
import { OpenAITool } from '../../../types/openai-types'
import { GenericContextService } from '../../context/generic.context'
import { ChatMessage } from '../../drafts/types'
import { FlowConfig } from '../../openai.config'
import { IPurchaseValidationDraft } from './purchase.types'
import { purchaseService } from './purchaseService'

export class PurchaseContextService extends GenericContextService<IPurchaseValidationDraft> {
  private static instance: PurchaseContextService
  private serviceFunctions = {
    ...purchaseFunctions,
    editPurchaseRecordField: purchaseFunctions.editPurchaseRecordField,
  }
  private contextTools = [...purchaseTools]
  protected flowType = FlowType.Purchase

  private constructor() {
    super()
    registerPurchaseEditDeleteHandler()
  }

  protected getDraft = async (phone: string): Promise<IPurchaseValidationDraft> => {
    return await purchaseService.loadDraft(phone)
  }

  protected getDraftHistory = async (userId: string): Promise<ChatMessage[]> => {
    return await purchaseService.getDraftHistory(userId)
  }

  protected getFlowConfig = (): Required<FlowConfig> => {
    return {
      allowedFunctions: ['startPurchaseRegistration', 'changePurchaseRegistrationField', 'confirmPurchaseRegistration', 'cancelPurchaseRegistration', 'editPurchaseRecordField', 'deletePurchaseRegistration'],
      startFunction: 'startPurchaseRegistration',
      changeFunction: 'changePurchaseRegistrationField',
      editFunction: 'editPurchaseRecordField',
      cancelFunction: 'cancelPurchaseRegistration',
    }
  }

  protected getFunctionToCall = (functionName: string) => {
    return this.serviceFunctions[functionName as keyof typeof this.serviceFunctions]
  }

  protected getTools = async (): Promise<OpenAITool[]> => {
    return this.contextTools
  }

  static getInstance(): PurchaseContextService {
    if (!PurchaseContextService.instance) {
      PurchaseContextService.instance = new PurchaseContextService()
    }
    return PurchaseContextService.instance
  }
}

export const purchaseContextService = PurchaseContextService.getInstance()
