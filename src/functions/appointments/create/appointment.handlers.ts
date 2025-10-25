import { MissingFieldHandler, MissingFieldHandlerResult } from '../../generic/generic.flow'
import { AppointmentDraft } from '../../../types/appointment.types'
import { getOrCreateBusinessConfig } from '../../../api/business.api'
import { formatServiceList, formatBarberList, formatAvailableSlots } from '../../../utils/appointment-formatters'
import { getAvailableSlots } from '../../../api/appointments.api'

export const serviceMissingHandler: MissingFieldHandler<AppointmentDraft> = async (phone, draft) => {
  const businessConfig = await getOrCreateBusinessConfig(phone)
  const servicesList = formatServiceList(businessConfig.services.filter((s) => s.active))

  return {
    message: `Qual serviço você deseja?\n\n${servicesList}`,
    interactive: false,
    draft,
  }
}

export const barberMissingHandler: MissingFieldHandler<AppointmentDraft> = async (phone, draft) => {
  const businessConfig = await getOrCreateBusinessConfig(phone)
  const barbersList = formatBarberList(businessConfig.barbers.filter((b) => b.active))

  return {
    message: `Tem preferência de barbeiro ou pode ser qualquer um?\n\n${barbersList}`,
    interactive: false,
    draft,
  }
}

export const dateMissingHandler: MissingFieldHandler<AppointmentDraft> = async (phone, draft) => {
  return {
    message: 'Que dia você prefere? (ex: "amanhã", "sábado", "15/11")',
    interactive: false,
    draft,
  }
}

export const timeMissingHandler: MissingFieldHandler<AppointmentDraft> = async (phone, draft) => {
  if (!draft.date || !draft.serviceId) {
    return {
      message: 'Precisamos da data e serviço primeiro para mostrar horários disponíveis.',
      interactive: false,
      draft,
    }
  }

  const businessConfig = await getOrCreateBusinessConfig(phone)
  const slots = await getAvailableSlots(businessConfig.id, draft.date, draft.serviceId, draft.barberId || undefined)

  if (slots.length === 0) {
    return {
      message: `Não há horários disponíveis para ${draft.date}. Escolha outra data?`,
      interactive: false,
      draft,
    }
  }

  const slotsList = formatAvailableSlots(slots, false)

  return {
    message: `${slotsList}\n\nQual horário prefere?`,
    interactive: false,
    draft,
  }
}

export const appointmentMissingHandlers: Record<'service' | 'barber' | 'date' | 'time', MissingFieldHandler<AppointmentDraft>> = {
  service: serviceMissingHandler,
  barber: barberMissingHandler,
  date: dateMissingHandler,
  time: timeMissingHandler,
}
