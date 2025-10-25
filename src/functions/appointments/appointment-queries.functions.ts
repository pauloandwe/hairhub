import { getAppointmentsByPhone, getNextAppointment, getUpcomingAppointments, getAvailableSlots } from '../../api/appointments.api'
import { getOrCreateBusinessConfig } from '../../api/business.api'
import { sendWhatsAppMessage } from '../../api/meta.api'
import { formatAppointmentList, formatAppointmentSummary, formatAvailableSlots, formatServiceList, formatBarberList } from '../../utils/appointment-formatters'

/**
 * Get all appointments for a customer
 */
export async function getMyAppointments(args: { phone: string }): Promise<string> {
  const { phone } = args

  try {
    const appointments = await getAppointmentsByPhone(phone)

    if (appointments.length === 0) {
      await sendWhatsAppMessage(phone, 'Você não tem agendamentos.')
      return 'No appointments found'
    }

    const formattedList = formatAppointmentList(appointments)
    await sendWhatsAppMessage(phone, formattedList)

    return 'Appointments list sent'
  } catch (error: any) {
    await sendWhatsAppMessage(phone, 'Erro ao buscar agendamentos. Tente novamente.')
    return `Error: ${error.message}`
  }
}

/**
 * Get next upcoming appointment
 */
export async function getNextAppointmentInfo(args: { phone: string }): Promise<string> {
  const { phone } = args

  try {
    const appointment = await getNextAppointment(phone)

    if (!appointment) {
      await sendWhatsAppMessage(phone, 'Você não tem agendamentos futuros.')
      return 'No upcoming appointments'
    }

    const summary = formatAppointmentSummary(appointment)
    await sendWhatsAppMessage(phone, `Seu próximo agendamento:\n\n${summary}`)

    return 'Next appointment sent'
  } catch (error: any) {
    await sendWhatsAppMessage(phone, 'Erro ao buscar próximo agendamento. Tente novamente.')
    return `Error: ${error.message}`
  }
}

/**
 * Get upcoming appointments
 */
export async function getUpcomingAppointmentsInfo(args: { phone: string; limit?: number }): Promise<string> {
  const { phone, limit = 5 } = args

  try {
    const appointments = await getUpcomingAppointments(phone, limit)

    if (appointments.length === 0) {
      await sendWhatsAppMessage(phone, 'Você não tem agendamentos futuros.')
      return 'No upcoming appointments'
    }

    const formattedList = formatAppointmentList(appointments)
    await sendWhatsAppMessage(phone, `Seus próximos agendamentos:\n\n${formattedList}`)

    return 'Upcoming appointments sent'
  } catch (error: any) {
    await sendWhatsAppMessage(phone, 'Erro ao buscar agendamentos. Tente novamente.')
    return `Error: ${error.message}`
  }
}

/**
 * Get available slots for a specific date
 */
export async function getAvailableSlotsInfo(args: { phone: string; date: string; serviceId?: string; barberId?: string }): Promise<string> {
  const { phone, date, serviceId, barberId } = args

  try {
    const businessConfig = await getOrCreateBusinessConfig(phone)

    // If no serviceId provided, use first service
    const actualServiceId = serviceId || businessConfig.services[0]?.id

    if (!actualServiceId) {
      await sendWhatsAppMessage(phone, 'Erro: nenhum serviço disponível.')
      return 'No services available'
    }

    const slots = await getAvailableSlots(businessConfig.id, date, actualServiceId, barberId)

    if (slots.length === 0) {
      await sendWhatsAppMessage(phone, `Não há horários disponíveis para ${date}.`)
      return 'No slots available'
    }

    const formattedSlots = formatAvailableSlots(slots, !!barberId)
    await sendWhatsAppMessage(phone, `Horários disponíveis para ${date}:\n\n${formattedSlots}`)

    return 'Available slots sent'
  } catch (error: any) {
    await sendWhatsAppMessage(phone, 'Erro ao buscar horários disponíveis. Tente novamente.')
    return `Error: ${error.message}`
  }
}

/**
 * Get list of services
 */
export async function getServices(args: { phone: string }): Promise<string> {
  const { phone } = args

  try {
    const businessConfig = await getOrCreateBusinessConfig(phone)
    const activeServices = businessConfig.services.filter((s) => s.active)

    if (activeServices.length === 0) {
      await sendWhatsAppMessage(phone, 'Nenhum serviço disponível no momento.')
      return 'No services available'
    }

    const formattedList = formatServiceList(activeServices)
    await sendWhatsAppMessage(phone, formattedList)

    return 'Services list sent'
  } catch (error: any) {
    await sendWhatsAppMessage(phone, 'Erro ao buscar serviços. Tente novamente.')
    return `Error: ${error.message}`
  }
}

/**
 * Get list of barbers
 */
export async function getBarbers(args: { phone: string }): Promise<string> {
  const { phone } = args

  try {
    const businessConfig = await getOrCreateBusinessConfig(phone)
    const activeBarbers = businessConfig.barbers.filter((b) => b.active)

    if (activeBarbers.length === 0) {
      await sendWhatsAppMessage(phone, 'Nenhum barbeiro disponível no momento.')
      return 'No barbers available'
    }

    const formattedList = formatBarberList(activeBarbers)
    await sendWhatsAppMessage(phone, formattedList)

    return 'Barbers list sent'
  } catch (error: any) {
    await sendWhatsAppMessage(phone, 'Erro ao buscar barbeiros. Tente novamente.')
    return `Error: ${error.message}`
  }
}

// Export all functions
export const appointmentQueriesFunctions = {
  getMyAppointments,
  getNextAppointmentInfo,
  getUpcomingAppointmentsInfo,
  getAvailableSlotsInfo,
  getServices,
  getBarbers,
}
