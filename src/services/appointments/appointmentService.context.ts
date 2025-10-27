import { FlowType } from '../../enums/generic.enum'
import { appointmentFunctions } from '../../functions/appointments/appointment.functions'
import { appointmentTools } from '../../tools/appointments/appointment.tools'
import { OpenAITool } from '../../types/openai-types'
import { GenericContextService } from '../context/generic.context'
import { ChatMessage } from '../drafts/types'
import { FlowConfig } from '../openai.config'
import { IAppointmentValidationDraft } from './appointment.types'
import { appointmentService } from './appointmentService'
import { registerAppointmentEditDeleteHandler } from '../../interactives/appointments/appointmentInteractives'

export class AppointmentContextService extends GenericContextService<IAppointmentValidationDraft> {
  private static instance: AppointmentContextService
  private serviceFunctions = {
    ...appointmentFunctions,
    editAppointmentRecordField: appointmentFunctions.editAppointmentRecordField,
  }
  private contextTools = [...appointmentTools]
  protected flowType = FlowType.Appointment

  private constructor() {
    super()
    registerAppointmentEditDeleteHandler()
  }

  protected getDraft = async (phone: string): Promise<IAppointmentValidationDraft> => {
    return await appointmentService.loadDraft(phone)
  }

  protected getDraftHistory = async (userId: string): Promise<ChatMessage[]> => {
    return await appointmentService.getDraftHistory(userId)
  }

  protected getFlowConfig = (): Required<FlowConfig> => {
    return {
      allowedFunctions: ['startAppointmentRegistration', 'changeAppointmentRegistrationField', 'confirmAppointmentRegistration', 'cancelAppointmentRegistration', 'editAppointmentRecordField', 'deleteAppointmentRegistration'],
      startFunction: 'startAppointmentRegistration',
      changeFunction: 'changeAppointmentRegistrationField',
      editFunction: 'editAppointmentRecordField',
      cancelFunction: 'cancelAppointmentRegistration',
    }
  }

  protected getFunctionToCall = (functionName: string) => {
    return this.serviceFunctions[functionName as keyof typeof this.serviceFunctions]
  }

  protected getTools = async (): Promise<OpenAITool[]> => {
    return this.contextTools
  }

  static getInstance(): AppointmentContextService {
    if (!AppointmentContextService.instance) {
      AppointmentContextService.instance = new AppointmentContextService()
    }
    return AppointmentContextService.instance
  }
}
