import { FlowType } from '../../../enums/generic.enum'
import { birthFunctions } from '../../../functions/livestocks/birth/birth.functions'
import { birthTools } from '../../../tools/livestocks/birth/birth.tools'
import { OpenAITool } from '../../../types/openai-types'
import { GenericContextService } from '../../context/generic.context'
import { ChatMessage } from '../../drafts/types'
import { FlowConfig } from '../../openai.config'
import { IBirthValidationDraft } from './birth.types'
import { birthService } from './birthService'
import { registerBirthEditDeleteHandler } from '../../../interactives/birth/birthInteractives'

export class BirthContextService extends GenericContextService<IBirthValidationDraft> {
  private static instance: BirthContextService
  private serviceFunctions = {
    ...birthFunctions,
    editBirthRecordField: birthFunctions.editBirthRecordField,
  }
  private contextTools = [...birthTools]
  protected flowType = FlowType.Birth

  private constructor() {
    super()
    registerBirthEditDeleteHandler()
  }

  protected getDraft = async (phone: string): Promise<IBirthValidationDraft> => {
    return await birthService.loadDraft(phone)
  }

  protected getDraftHistory = async (userId: string): Promise<ChatMessage[]> => {
    return await birthService.getDraftHistory(userId)
  }

  protected getFlowConfig = (): Required<FlowConfig> => {
    return {
      allowedFunctions: ['startAnimalBirthRegistration', 'changeAnimalBirthRegistrationField', 'confirmAnimalBirthRegistration', 'cancelAnimalBirthRegistration', 'editBirthRecordField', 'deleteBirthRegistration'],
      startFunction: 'startAnimalBirthRegistration',
      changeFunction: 'changeAnimalBirthRegistrationField',
      editFunction: 'editBirthRecordField',
      cancelFunction: 'cancelAnimalBirthRegistration',
    }
  }

  protected getFunctionToCall = (functionName: string) => {
    return this.serviceFunctions[functionName as keyof typeof this.serviceFunctions]
  }

  protected getTools = async (): Promise<OpenAITool[]> => {
    return this.contextTools
  }

  static getInstance(): BirthContextService {
    if (!BirthContextService.instance) {
      BirthContextService.instance = new BirthContextService()
    }
    return BirthContextService.instance
  }
}
