import { appointmentService } from '../../services/appointments/appointment.service'
import { sendWhatsAppMessage } from '../../api/meta.api'
import { setUserContext, getUserContext, resetActiveRegistration } from '../../env.config'
import { FlowType, FlowStep } from '../../enums/generic.enum'
import { getOrCreateBusinessConfig } from '../../api/business.api'
import { formatAvailableSlots, formatServiceList, formatBarberList } from '../../utils/appointment-formatters'
import { getAvailableSlots } from '../../api/appointments.api'

/**
 * Start appointment creation flow
 */
export async function startAppointmentCreation(args: { phone: string }): Promise<string> {
  const { phone } = args

  // Set flow context
  await setUserContext(phone, {
    activeRegistration: {
      type: FlowType.AppointmentCreate,
      step: FlowStep.Creating,
    },
  })

  // Get business config
  const businessConfig = await getOrCreateBusinessConfig(phone)

  // Show services
  const servicesList = formatServiceList(businessConfig.services.filter((s) => s.active))

  await sendWhatsAppMessage(phone, `Vou te ajudar a agendar um horário! ✂️\n\n${servicesList}\n\nQual serviço você deseja?`)

  return 'Appointment creation flow started'
}

/**
 * Continue appointment creation (set service)
 */
export async function setAppointmentService(args: { phone: string; serviceName: string }): Promise<string> {
  const { phone, serviceName } = args

  const businessConfig = await getOrCreateBusinessConfig(phone)

  // Find service
  const service = businessConfig.services.find((s) => s.active && s.name.toLowerCase().includes(serviceName.toLowerCase()))

  if (!service) {
    await sendWhatsAppMessage(phone, `Não encontrei o serviço "${serviceName}". Pode escolher um da lista?`)
    return 'Service not found'
  }

  // Update draft
  await appointmentService.updateField(phone, 'service', { id: service.id, name: service.name })
  await appointmentService.updateField(phone, 'serviceId', service.id)
  await appointmentService.updateField(phone, 'duration', service.duration)

  // Ask for barber
  const barbersList = formatBarberList(businessConfig.barbers.filter((b) => b.active))

  await sendWhatsAppMessage(phone, `Perfeito! ${service.name} selecionado (${service.duration} min).\n\n${barbersList}\n\nTem preferência de barbeiro ou pode ser qualquer um?`)

  return 'Service set, asking for barber'
}

/**
 * Set barber for appointment
 */
export async function setAppointmentBarber(args: { phone: string; barberName: string }): Promise<string> {
  const { phone, barberName } = args

  const businessConfig = await getOrCreateBusinessConfig(phone)

  // Handle "any" or "qualquer"
  if (barberName.toLowerCase().includes('qualquer') || barberName.toLowerCase().includes('tanto faz')) {
    // Pick first active barber
    const firstBarber = businessConfig.barbers.find((b) => b.active)
    if (firstBarber) {
      await appointmentService.updateField(phone, 'barber', { id: firstBarber.id, name: firstBarber.name })
      await appointmentService.updateField(phone, 'barberId', firstBarber.id)

      await sendWhatsAppMessage(phone, `Ok! Pode ser com qualquer barbeiro disponível.\n\nQue dia você prefere?`)
      return 'Any barber selected, asking for date'
    }
  }

  // Find barber
  const barber = businessConfig.barbers.find((b) => b.active && b.name.toLowerCase().includes(barberName.toLowerCase()))

  if (!barber) {
    await sendWhatsAppMessage(phone, `Não encontrei o barbeiro "${barberName}". Pode escolher um da lista?`)
    return 'Barber not found'
  }

  // Update draft
  await appointmentService.updateField(phone, 'barber', { id: barber.id, name: barber.name })
  await appointmentService.updateField(phone, 'barberId', barber.id)

  await sendWhatsAppMessage(phone, `Ótimo! Agendamento com ${barber.name}.\n\nQue dia você prefere?`)

  return 'Barber set, asking for date'
}

/**
 * Set date for appointment
 */
export async function setAppointmentDate(args: { phone: string; date: string }): Promise<string> {
  const { phone, date } = args

  // Validate date format (should be YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await sendWhatsAppMessage(phone, 'Formato de data inválido. Use YYYY-MM-DD ou descreva o dia.')
    return 'Invalid date format'
  }

  const draft = await appointmentService.getDraft(phone)
  const businessConfig = await getOrCreateBusinessConfig(phone)

  // Update draft
  await appointmentService.updateField(phone, 'date', date)

  // Get available slots
  const slots = await getAvailableSlots(businessConfig.id, date, draft.serviceId!, draft.barberId)

  if (slots.length === 0) {
    await sendWhatsAppMessage(phone, `Não temos horários disponíveis para ${date}. Tente outro dia?`)
    return 'No available slots'
  }

  const slotsList = formatAvailableSlots(slots, false)

  await sendWhatsAppMessage(phone, `${slotsList}\n\nQual horário prefere?`)

  return 'Date set, showing available slots'
}

/**
 * Set time and confirm appointment
 */
export async function setAppointmentTime(args: { phone: string; time: string }): Promise<string> {
  const { phone, time } = args

  // Validate time format (HH:mm)
  if (!/^\d{2}:\d{2}$/.test(time)) {
    await sendWhatsAppMessage(phone, 'Formato de hora inválido. Use HH:mm (ex: 14:30)')
    return 'Invalid time format'
  }

  // Update draft
  await appointmentService.updateField(phone, 'time', time)

  // Get draft and validate
  const draft = await appointmentService.getDraft(phone)
  const validation = await appointmentService.validateDraft(phone, draft)

  if (!validation.valid) {
    await sendWhatsAppMessage(phone, `❌ ${validation.error}\n\nEscolha outro horário?`)
    return 'Validation failed'
  }

  // Show confirmation
  const summary = appointmentService.buildSummary(draft)

  await sendWhatsAppMessage(phone, `Confirma o agendamento?\n\n${summary}\n\nResponda "sim" para confirmar ou "não" para cancelar.`)

  return 'Time set, awaiting confirmation'
}

/**
 * Confirm and create appointment
 */
export async function confirmAppointmentCreation(args: { phone: string; customerName?: string }): Promise<string> {
  const { phone, customerName } = args

  try {
    // Get user context for name
    const context = await getUserContext(phone)
    const name = customerName || context?.userName || 'Cliente'

    // Create appointment
    const appointment = await appointmentService.createFromDraft(phone, name)

    // Reset flow
    await resetActiveRegistration(phone)

    const dateTime = new Date(appointment.dateTime)
    const dateStr = dateTime.toLocaleDateString('pt-BR')
    const timeStr = dateTime.toTimeString().slice(0, 5)

    await sendWhatsAppMessage(phone, `✅ Agendamento confirmado!\n\n📅 ${dateStr} às ${timeStr}\n✂️ ${appointment.serviceName}\n💈 ${appointment.barberName}\n\nVocê receberá lembretes automáticos. Até lá! 👋`)

    return 'Appointment created successfully'
  } catch (error: any) {
    await sendWhatsAppMessage(phone, `❌ Erro ao criar agendamento: ${error.message}`)
    return `Error: ${error.message}`
  }
}

/**
 * Cancel appointment creation flow
 */
export async function cancelAppointmentCreation(args: { phone: string }): Promise<string> {
  const { phone } = args

  await appointmentService.clearDraft(phone)
  await resetActiveRegistration(phone)

  await sendWhatsAppMessage(phone, 'Ok, agendamento cancelado. Se precisar marcar, é só me chamar! 👋')

  return 'Appointment creation cancelled'
}

// Export all functions
export const appointmentFunctions = {
  startAppointmentCreation,
  setAppointmentService,
  setAppointmentBarber,
  setAppointmentDate,
  setAppointmentTime,
  confirmAppointmentCreation,
  cancelAppointmentCreation,
}
