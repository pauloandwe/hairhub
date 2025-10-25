import { GenericContextService } from '../../context/generic.context'
import { AppointmentDraft } from '../../../types/appointment.types'
import { FlowType } from '../../../enums/generic.enum'
import { FlowConfig } from '../../openai.config'
import { OpenAITool } from '../../../types/openai-types'
import { ChatMessage } from '../../drafts/types'
import { appointmentService } from '../appointment.service'

export class AppointmentContextService extends GenericContextService<AppointmentDraft> {
  private static instance: AppointmentContextService
  protected flowType = FlowType.AppointmentCreate

  private constructor() {
    super()
  }

  static getInstance(): AppointmentContextService {
    if (!AppointmentContextService.instance) {
      AppointmentContextService.instance = new AppointmentContextService()
    }
    return AppointmentContextService.instance
  }

  protected getFlowConfig = (): Required<FlowConfig> => {
    return {
      allowedFunctions: [],
      startFunction: 'startAppointmentCreation',
      changeFunction: 'changeAppointmentField',
      editFunction: "",
      cancelFunction: 'cancelAppointmentCreation',
    }
  }

  protected getFunctionToCall = (functionName: string): any => {
    // Return function implementations - stub for now
    return undefined
  }

  protected getDraft = async (phone: string): Promise<AppointmentDraft> => {
    return await appointmentService.getDraft(phone)
  }

  protected getDraftHistory = async (userId: string): Promise<ChatMessage[]> => {
    return []
  }

  protected getTools = async (): Promise<OpenAITool[]> => {
    return []
  }
}
