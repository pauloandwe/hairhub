import { FlowType } from '../../enums/generic.enum'
import { appointmentCancellationFunctions } from '../../functions/appointments/cancellation/appointment-cancellation.functions'
import { appointmentCancellationTools } from '../../tools/appointments/appointment-cancellation.tools'
import { OpenAITool } from '../../types/openai-types'
import { GenericContextService } from '../context/generic.context'
import { ChatMessage } from '../drafts/types'
import { FlowConfig } from '../openai.config'
import { AppointmentCancellationDraft, appointmentCancellationDraftService } from './appointment-cancellation-draft.service'

export class AppointmentCancellationContextService extends GenericContextService<AppointmentCancellationDraft> {
  private static instance: AppointmentCancellationContextService
  private serviceFunctions = {
    ...appointmentCancellationFunctions,
  }
  private contextTools = [...appointmentCancellationTools]
  protected flowType = FlowType.AppointmentCancellation

  private constructor() {
    super()
  }

  protected getDraft = async (phone: string): Promise<AppointmentCancellationDraft> => {
    return appointmentCancellationDraftService.loadDraft(phone)
  }

  protected getDraftHistory = async (userId: string): Promise<ChatMessage[]> => {
    return appointmentCancellationDraftService.getDraftHistory(userId)
  }

  protected getFlowConfig = (): Required<FlowConfig> => {
    return {
      allowedFunctions: ['startAppointmentCancellation', 'changeAppointmentCancellationField', 'confirmAppointmentCancellation', 'cancelAppointmentCancellation'],
      startFunction: 'startAppointmentCancellation',
      changeFunction: 'changeAppointmentCancellationField',
      editFunction: 'changeAppointmentCancellationField',
      cancelFunction: 'cancelAppointmentCancellation',
    }
  }

  protected getFunctionToCall = (functionName: string) => {
    return this.serviceFunctions[functionName as keyof typeof this.serviceFunctions]
  }

  protected getTools = async (): Promise<OpenAITool[]> => {
    return this.contextTools
  }

  static getInstance(): AppointmentCancellationContextService {
    if (!AppointmentCancellationContextService.instance) {
      AppointmentCancellationContextService.instance = new AppointmentCancellationContextService()
    }
    return AppointmentCancellationContextService.instance
  }
}
