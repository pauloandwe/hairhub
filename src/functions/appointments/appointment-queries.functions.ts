import { DateFormatter } from '../../utils/date'
import { AppointmentRescheduleAppointment, getBusinessTimezoneForPhone } from '../../env.config'
import { customerAppointmentsService } from '../../services/appointments/customer-appointments.service'
import { professionalService, PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES, PUBLIC_SLOT_STEP_MINUTES } from '../../services/appointments/professional.service'
import { serviceService } from '../../services/appointments/service.service'
import { aiLogger } from '../../utils/pino'
import { formatIsoDateInTimeZone } from '../../utils/timezone'

const logger = aiLogger.child({ module: 'appointment-queries' })

interface FormattedAppointment {
  id: string
  date: string
  time: string
  service: string
  professional: string
  status: string
  notes: string
  duration: number
}

interface AppointmentQueryResponse {
  status: 'success' | 'error'
  data?: {
    appointments: FormattedAppointment[]
    total: number
    message: string
  }
  error?: string
}

interface QueryArgs {
  phone: string
  clientPhone?: string
  limit?: number
}

const DEFAULT_LIMIT = 10

const ERROR_MESSAGES = {
  API_FETCH_ERROR: 'Não consegui buscar seus agendamentos. Tenta de novo mais tarde.',
  GENERIC_ERROR: 'Desculpa, tive um problema. Tenta de novo mais tarde.',
  NO_APPOINTMENTS: 'Você não tem agendamentos registrados.',
  NO_UPCOMING_APPOINTMENTS: 'Você não tem próximos agendamentos em aberto.',
} as const

const SUCCESS_MESSAGE = (count: number) => (count > 0 ? `Você tem ${count} agendamento(s).` : ERROR_MESSAGES.NO_APPOINTMENTS)
const UPCOMING_SUCCESS_MESSAGE = (count: number) => (count > 0 ? `Você tem ${count} próximo(s) agendamento(s).` : ERROR_MESSAGES.NO_UPCOMING_APPOINTMENTS)

const DEFAULT_SERVICE_NAME = 'Serviço não especificado'
const DEFAULT_BARBER_NAME = 'Professional não especificado'

interface DisplaySlot {
  time: string
  professionals?: { id: string; name: string }[]
  professionalId?: number
}

function formatAppointment(apt: AppointmentRescheduleAppointment): FormattedAppointment {
  return {
    id: apt.id?.toString() || '',
    date: DateFormatter.formatToBrazilianDate(apt.startDate, apt.businessTimezone) || '',
    time: DateFormatter.formatToHourMinute(apt.startDate, apt.businessTimezone) || '',
    service: apt.serviceName || DEFAULT_SERVICE_NAME,
    professional: apt.professionalName || DEFAULT_BARBER_NAME,
    status: apt.status || 'pending',
    notes: apt.notes || '',
    duration: apt.serviceDuration || 0,
  }
}

function buildDisplaySlotsForProfessional(slots: string[], professionalId: number): DisplaySlot[] {
  return slots.map((slot) => ({
    time: slot,
    professionalId,
  }))
}

function buildDisplaySlotsAggregated(slots: Array<{ start: string; professionals: { id: string; name: string }[] }>): DisplaySlot[] {
  return slots.map((slot) => ({
    time: slot.start,
    professionals: slot.professionals,
  }))
}

function summarizeSlotTimes(slots: Array<{ time: string }>, limit: number = 10): string[] {
  return slots.slice(0, limit).map((slot) => slot.time)
}

export const appointmentQueryFunctions = {
  getUpcomingAppointments: async (args: QueryArgs): Promise<AppointmentQueryResponse> => {
    const { phone, limit = DEFAULT_LIMIT } = args

    logger.info({ phone, limit }, 'Consultando próximos agendamentos')

    try {
      const upcomingAppointments = await customerAppointmentsService.getUpcomingAppointments(phone)
      const limitedAppointments = upcomingAppointments.slice(0, limit).map(formatAppointment)

      return {
        status: 'success',
        data: {
          appointments: limitedAppointments,
          total: upcomingAppointments.length,
          message: UPCOMING_SUCCESS_MESSAGE(limitedAppointments.length),
        },
      }
    } catch (error) {
      logger.error({ phone, error }, 'Erro ao consultar próximos agendamentos')
      return { status: 'error', error: ERROR_MESSAGES.API_FETCH_ERROR }
    }
  },

  getAppointmentHistory: async (args: QueryArgs): Promise<AppointmentQueryResponse> => {
    const { phone, limit = DEFAULT_LIMIT } = args

    logger.info({ phone, limit }, 'Consultando histórico de agendamentos')

    try {
      const appointmentData = await customerAppointmentsService.getAppointmentHistory(phone)
      const appointments = appointmentData.map(formatAppointment)
      const limitedAppointments = appointments.slice(0, limit)

      return {
        status: 'success',
        data: {
          appointments: limitedAppointments,
          total: appointments.length,
          message: SUCCESS_MESSAGE(limitedAppointments.length),
        },
      }
    } catch (error) {
      logger.error({ phone, error }, 'Erro ao consultar histórico de agendamentos')
      return { status: 'error', error: ERROR_MESSAGES.API_FETCH_ERROR }
    }
  },

  getAvailableTimeSlots: async (args: { phone: string; date?: string; professionalId?: number; serviceId?: number }): Promise<any> => {
    const { phone, date, professionalId, serviceId } = args
    const normalizedDateInput = typeof date === 'string' ? date.trim() : ''
    if (normalizedDateInput && !DateFormatter.isValidISODate(normalizedDateInput)) {
      return {
        status: 'error',
        error: 'Nao consegui entender essa data. Me fala outra, por favor.',
      }
    }

    const normalizedDate = normalizedDateInput || formatIsoDateInTimeZone(new Date(), getBusinessTimezoneForPhone(phone)) || new Date().toISOString().split('T')[0]

    logger.info({ date: normalizedDate, professionalId, serviceId }, 'Consultando horários disponíveis')

    try {
      if (professionalId) {
        const availableSlots = await professionalService.getAvailableSlotsDetailed({
          phone,
          professionalId,
          date: normalizedDate,
          serviceId,
          stepMinutes: PUBLIC_SLOT_STEP_MINUTES,
        })
        const availableSlotsRaw = buildDisplaySlotsForProfessional(availableSlots.rawSlots, professionalId)
        const availableSlotsDisplay = buildDisplaySlotsForProfessional(availableSlots.displaySlots, professionalId)

        logger.info(
          {
            date: normalizedDate,
            professionalId,
            serviceId,
            rawSlotsCount: availableSlotsRaw.length,
            displaySlotsCount: availableSlotsDisplay.length,
            rawSlotsPreview: summarizeSlotTimes(availableSlotsRaw),
            displaySlotsPreview: summarizeSlotTimes(availableSlotsDisplay),
          },
          'Diagnóstico de disponibilidade por profissional',
        )

        return {
          status: 'success',
          data: {
            date: normalizedDate,
            display_interval_minutes: availableSlots.displayIntervalMinutes || PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES,
            availability_precision: serviceId ? 'service_specific' : 'suggestive_without_service',
            available_slots: availableSlotsDisplay,
            available_slots_display: availableSlotsDisplay,
            available_slots_raw: availableSlotsRaw,
          },
        }
      }

      const aggregatedSlots = await professionalService.getAvailableSlotsAggregatedDetailed({
        phone,
        date: normalizedDate,
        serviceId,
        stepMinutes: PUBLIC_SLOT_STEP_MINUTES,
      })
      const availableSlotsRaw = buildDisplaySlotsAggregated(aggregatedSlots.rawSlots)
      const availableSlotsDisplay = buildDisplaySlotsAggregated(aggregatedSlots.displaySlots)

      logger.info(
        {
          date: normalizedDate,
          professionalId: null,
          serviceId,
          rawSlotsCount: availableSlotsRaw.length,
          displaySlotsCount: availableSlotsDisplay.length,
          rawSlotsPreview: summarizeSlotTimes(availableSlotsRaw),
          displaySlotsPreview: summarizeSlotTimes(availableSlotsDisplay),
        },
        'Diagnóstico de disponibilidade agregada',
      )

      return {
        status: 'success',
        data: {
          date: normalizedDate,
          display_interval_minutes: aggregatedSlots.displayIntervalMinutes || PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES,
          availability_precision: serviceId ? 'service_specific' : 'suggestive_without_service',
          available_slots: availableSlotsDisplay,
          available_slots_display: availableSlotsDisplay,
          available_slots_raw: availableSlotsRaw,
        },
      }
    } catch (error) {
      logger.error({ error }, 'Erro ao consultar horários disponíveis')
      return { error: ERROR_MESSAGES.GENERIC_ERROR }
    }
  },

  getServices: async (args: { phone: string }): Promise<any> => {
    const { phone } = args

    try {
      const services = await serviceService.getServices(phone)

      return {
        status: 'success',
        data: {
          services,
          message: services.length > 0 ? 'Serviços disponíveis.' : 'Nenhum serviço disponível no momento.',
        },
      }
    } catch (error) {
      logger.error({ error }, 'Erro ao consultar serviços')
      return { error: ERROR_MESSAGES.GENERIC_ERROR }
    }
  },

  getProfessionals: async (args: { phone: string }): Promise<any> => {
    const { phone } = args
    logger.info({ phone }, 'Consultando barbeiros disponíveis')

    try {
      const professionals = await professionalService.getProfessionals(phone)
      const normalizedProfessionals = professionals.map((item) => {
        const specialtyCandidates = [Array.isArray((item as any)?.specialties) ? (item as any).specialties.join(', ') : undefined, typeof (item as any)?.specialty === 'string' ? (item as any).specialty : undefined, typeof item.description === 'string' ? item.description : undefined]

        const specialty = specialtyCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0)

        return {
          id: item.id,
          name: item.name,
          ...(specialty ? { specialty } : {}),
          ...(typeof (item as any)?.available === 'boolean' ? { available: (item as any).available } : {}),
        }
      })

      return {
        status: 'success',
        data: {
          professionals: normalizedProfessionals,
          message: normalizedProfessionals.length > 0 ? 'Profissionais disponíveis.' : 'Nenhum profissional com horários configurados.',
        },
      }
    } catch (error) {
      logger.error({ error }, 'Erro ao consultar barbeiros')
      return { error: ERROR_MESSAGES.GENERIC_ERROR }
    }
  },
}
