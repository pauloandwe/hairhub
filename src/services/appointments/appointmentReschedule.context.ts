import { FlowType } from '../../enums/generic.enum'
import { getBusinessIdForPhone, getUserContextSync } from '../../env.config'
import { appointmentRescheduleFunctions } from '../../functions/appointments/reschedule/appointment-reschedule.functions'
import { appointmentRescheduleTools } from '../../tools/appointments/appointment-reschedule.tools'
import { OpenAITool } from '../../types/openai-types'
import { GenericContextService } from '../context/generic.context'
import { ChatMessage } from '../drafts/types'
import { FlowConfig } from '../openai.config'
import { normalizeAppointmentDateInput } from './appointment-tool-args'
import { RescheduleDraft, appointmentRescheduleDraftService } from './appointment-reschedule-draft.service'
import OpenAI from 'openai'

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

  protected saveDraft = async (phone: string, draft: RescheduleDraft): Promise<void> => {
    await appointmentRescheduleDraftService.saveDraft(phone, draft)
  }

  protected getMissingFields = async (draft: RescheduleDraft): Promise<string[]> => {
    return (await appointmentRescheduleDraftService.hasMissingFields(draft)).map(String)
  }

  protected getDraftHistory = async (userId: string): Promise<ChatMessage[]> => {
    return await appointmentRescheduleDraftService.getDraftHistory(userId)
  }

  protected replayPendingStep = async (userId: string): Promise<void> => {
    await appointmentRescheduleFunctions.replayPendingStep({ phone: userId })
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

  protected override executeToolFunction = async (
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
    phone: string,
  ) => {
    try {
      if (toolCall.type !== 'function') {
        return {
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          content: JSON.stringify({ error: 'Tipo de tool_call não suportado' }),
        }
      }

      const functionName = toolCall.function.name
      const rawArgs = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>
      const functionToCall = this.getFunctionToCall(functionName)

      if (!functionToCall) {
        return {
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          content: JSON.stringify({
            error: `Função "${functionName}" não encontrada.`,
          }),
        }
      }

      if (
        (functionName === 'changeAppointmentRescheduleField' || functionName === 'editAppointmentRescheduleField') &&
        typeof rawArgs.field === 'string' &&
        rawArgs.field === 'newDate' &&
        rawArgs.value !== undefined
      ) {
        const runtimeContext = getUserContextSync(phone)
        const normalized = await normalizeAppointmentDateInput({
          messageText: typeof rawArgs.value === 'string' ? rawArgs.value : String(rawArgs.value),
          currentDateValue: rawArgs.value,
          timezone: runtimeContext?.businessTimezone,
          locale: String(runtimeContext?.locale || runtimeContext?.language || 'pt-BR'),
        })

        if (normalized.resolution.requiresClarification || !normalized.resolution.normalizedDate) {
          return {
            tool_call_id: toolCall.id,
            role: 'tool' as const,
            content: JSON.stringify({
              error: normalized.resolution.clarificationMessage || 'Nao consegui entender essa data. Me fala outra, por favor.',
            }),
          }
        }

        rawArgs.value = normalized.resolution.normalizedDate
      }

      const storedFarmId = getBusinessIdForPhone(phone)
      const result = await functionToCall({
        ...rawArgs,
        farmId: storedFarmId || rawArgs.farmId,
        phone,
      } as any)

      return {
        tool_call_id: toolCall.id,
        role: 'tool' as const,
        content: JSON.stringify(result),
      }
    } catch (error) {
      console.error('[AppointmentRescheduleContextService] Erro ao normalizar data da remarcacao:', error)
      return {
        tool_call_id: toolCall.id,
        role: 'tool' as const,
        content: JSON.stringify({
          error: 'Ops, ocorreu um erro ao executar a função. Tente novamente.',
        }),
      }
    }
  }

  static getInstance(): AppointmentRescheduleContextService {
    if (!AppointmentRescheduleContextService.instance) {
      AppointmentRescheduleContextService.instance = new AppointmentRescheduleContextService()
    }
    return AppointmentRescheduleContextService.instance
  }
}
