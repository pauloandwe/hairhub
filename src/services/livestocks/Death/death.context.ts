import { FlowType } from '../../../enums/generic.enum'
import { deathFunctions } from '../../../functions/livestocks/death/death.functions'
import { deathTools } from '../../../tools/livestocks/death.tools'
import { OpenAITool } from '../../../types/openai-types'
import { GenericContextService } from '../../context/generic.context'
import { ChatMessage } from '../../drafts/types'
import { FlowConfig } from '../../openai.config'
import { DeathValidationDraft, deathDraftService, loadDeathDraft } from '../death-draft.service'
import { registerDeathEditDeleteHandler } from '../../../interactives/death/deathInteractives'

export class DeathContextService extends GenericContextService<DeathValidationDraft> {
  private static instance: DeathContextService
  private serviceFunctions = {
    ...deathFunctions,
    editDeathRecordField: deathFunctions.editDeathRecordField,
  }
  private contextTools = [...deathTools]
  protected flowType = FlowType.Death
  private constructor() {
    super()
    registerDeathEditDeleteHandler()
  }

  protected getDraft = async (phone: string): Promise<DeathValidationDraft> => {
    return await loadDeathDraft(phone)
  }

  protected getDraftHistory = async (userId: string): Promise<ChatMessage[]> => {
    return await deathDraftService.getDraftHistory(userId)
  }

  protected getFlowConfig = (): Required<FlowConfig> => {
    return {
      allowedFunctions: ['startAnimalDeathRegistration', 'changeAnimalDeathRegistrationField', 'confirmAnimalDeathRegistration', 'cancelAnimalDeathRegistration', 'editDeathRecordField'],
      startFunction: 'startAnimalDeathRegistration',
      changeFunction: 'changeAnimalDeathRegistrationField',
      editFunction: 'editDeathRecordField',
      cancelFunction: 'cancelAnimalDeathRegistration',
    }
  }

  protected getFunctionToCall = (functionName: string) => {
    return this.serviceFunctions[functionName as keyof typeof this.serviceFunctions]
  }

  protected getTools = async (): Promise<OpenAITool[]> => {
    return this.contextTools
  }

  static getInstance(): DeathContextService {
    if (!DeathContextService.instance) {
      DeathContextService.instance = new DeathContextService()
    }
    return DeathContextService.instance
  }
}
