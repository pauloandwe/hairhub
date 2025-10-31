import { FlowType } from '../../enums/generic.enum'
import { appointmentRescheduleFunctions } from '../../functions/appointments/reschedule/appointment-reschedule.functions'
import { appointmentRescheduleTools } from '../../tools/appointments/appointment-reschedule.tools'
import { OpenAITool } from '../../types/openai-types'
import { GenericContextService } from '../context/generic.context'
import { ChatMessage } from '../drafts/types'
import { FlowConfig } from '../openai.config'
import { RescheduleDraft, appointmentRescheduleDraftService } from './appointment-reschedule-draft.service'

export class AppointmentRescheduleContextService extends GenericContextService<RescheduleDraft> {
  private static instance: AppointmentRescheduleContextService
  private serviceFunctions = {
    ...appointmentRescheduleFunctions,
    editAppointmentRescheduleField: appointmentRescheduleFunctions.editAppointmentRescheduleField,
  }
  private contextTools = [...appointmentRescheduleTools]
  protected flowType = FlowType.AppointmentReschedule

  private constructor() {
    super()
  }

  protected getDraft = async (phone: string): Promise<RescheduleDraft> => {
    return await appointmentRescheduleDraftService.loadDraft(phone)
  }

  protected getDraftHistory = async (userId: string): Promise<ChatMessage[]> => {
    return await appointmentRescheduleDraftService.getDraftHistory(userId)
  }

  protected getFlowConfig = (): Required<FlowConfig> => {
    return {
      allowedFunctions: ['startAppointmentReschedule', 'changeAppointmentRescheduleField', 'confirmAppointmentReschedule', 'cancelAppointmentReschedule', 'editAppointmentRescheduleField'],
      startFunction: 'startAppointmentReschedule',
      changeFunction: 'changeAppointmentRescheduleField',
      editFunction: 'editAppointmentRescheduleField',
      cancelFunction: 'cancelAppointmentReschedule',
    }
  }

  protected getFunctionToCall = (functionName: string) => {
    return this.serviceFunctions[functionName as keyof typeof this.serviceFunctions]
  }

  protected getTools = async (): Promise<OpenAITool[]> => {
    return this.contextTools
  }

  static getInstance(): AppointmentRescheduleContextService {
    if (!AppointmentRescheduleContextService.instance) {
      AppointmentRescheduleContextService.instance = new AppointmentRescheduleContextService()
    }
    return AppointmentRescheduleContextService.instance
  }
}
