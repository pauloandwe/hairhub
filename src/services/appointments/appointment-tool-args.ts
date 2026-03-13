import type { PendingAppointmentDateClarification } from '../../env.config'
import { AppointmentDateInterpretation, RequestedAppointmentDateResolution } from '../../utils/appointment-date-resolution'
import { appointmentDateInterpreterService, AppointmentDateInterpreterService } from './appointment-date-interpreter.service'

const DATE_NORMALIZED_FUNCTIONS = new Set(['getAvailableTimeSlots', 'startAppointmentRegistration'])

export interface NormalizeAppointmentToolArgumentsParams {
  functionName: string
  args: Record<string, any>
  incomingMessage?: string | null
  timezone?: string | null
  locale?: string | null
  now?: Date
  pendingClarification?: PendingAppointmentDateClarification | null
  interpreter?: AppointmentDateInterpreterService
}

export interface NormalizeAppointmentToolArgumentsResult {
  args: Record<string, any>
  resolution: RequestedAppointmentDateResolution | null
  interpretation: AppointmentDateInterpretation | null
}

export interface NormalizeAppointmentDateInputParams {
  messageText?: string | null
  currentDateValue?: unknown
  timezone?: string | null
  locale?: string | null
  now?: Date
  pendingClarification?: PendingAppointmentDateClarification | null
  interpreter?: AppointmentDateInterpreterService
}

export interface NormalizeAppointmentDateInputResult {
  resolution: RequestedAppointmentDateResolution
  interpretation: AppointmentDateInterpretation
}

export async function normalizeAppointmentDateInput(
  params: NormalizeAppointmentDateInputParams,
): Promise<NormalizeAppointmentDateInputResult> {
  const interpreter = params.interpreter || appointmentDateInterpreterService
  const interpreted = await interpreter.interpretRequestedAppointmentDate({
    messageText: params.messageText,
    locale: params.locale,
    timezone: params.timezone,
    now: params.now,
    pendingClarification: params.pendingClarification,
    currentArgs: {
      appointmentDate: params.currentDateValue,
      date: params.currentDateValue,
    },
  })

  return {
    resolution: interpreted.resolution,
    interpretation: interpreted.interpretation,
  }
}

export async function normalizeAppointmentToolArguments(params: NormalizeAppointmentToolArgumentsParams): Promise<NormalizeAppointmentToolArgumentsResult> {
  const { functionName, args, incomingMessage, timezone, locale, now, pendingClarification } = params
  const nextArgs = { ...args }

  if (!DATE_NORMALIZED_FUNCTIONS.has(functionName)) {
    return {
      args: nextArgs,
      resolution: null,
      interpretation: null,
    }
  }

  const interpreted = await normalizeAppointmentDateInput({
    messageText: incomingMessage,
    currentDateValue: nextArgs.appointmentDate ?? nextArgs.date,
    timezone,
    locale,
    now,
    pendingClarification,
    interpreter: params.interpreter,
  })
  const resolution = interpreted.resolution

  if (resolution.normalizedDate) {
    if (functionName === 'getAvailableTimeSlots') {
      nextArgs.date = resolution.normalizedDate
    } else if (functionName === 'startAppointmentRegistration') {
      nextArgs.appointmentDate = resolution.normalizedDate
      if (Object.prototype.hasOwnProperty.call(nextArgs, 'date')) {
        nextArgs.date = resolution.normalizedDate
      }
    }
  }

  return {
    args: nextArgs,
    resolution: interpreted.resolution,
    interpretation: interpreted.interpretation,
  }
}
