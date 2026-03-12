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

  const interpreter = params.interpreter || appointmentDateInterpreterService
  const interpreted = await interpreter.interpretRequestedAppointmentDate({
    messageText: incomingMessage,
    locale,
    timezone,
    now,
    pendingClarification,
    currentArgs: {
      appointmentDate: nextArgs.appointmentDate,
      date: nextArgs.date,
    },
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
    resolution,
    interpretation: interpreted.interpretation,
  }
}
