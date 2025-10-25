import { Appointment, AvailableSlot } from '../types/appointment.types'
import { Barber, Service } from '../types/business.types'
import { formatDateFullBR, formatDateBR } from './time.utils'

/**
 * Format appointment summary for display
 */
export function formatAppointmentSummary(appointment: Appointment): string {
  const dateTime = new Date(appointment.dateTime)
  const date = dateTime.toISOString().split('T')[0]
  const time = dateTime.toTimeString().slice(0, 5)

  return `📅 ${formatDateFullBR(date)} às ${time}
✂️ ${appointment.serviceName}
💈 Barbeiro: ${appointment.barberName}
${appointment.notes ? `📝 ${appointment.notes}` : ''}`
}

/**
 * Format appointment list
 */
export function formatAppointmentList(appointments: Appointment[]): string {
  if (appointments.length === 0) {
    return 'Você não tem agendamentos.'
  }

  const lines = appointments.map((apt, index) => {
    const dateTime = new Date(apt.dateTime)
    const date = dateTime.toISOString().split('T')[0]
    const time = dateTime.toTimeString().slice(0, 5)
    const statusEmoji = apt.status === 'CANCELLED' ? '❌' : '✅'

    return `${index + 1}. ${statusEmoji} ${formatDateBR(date)} às ${time}
   ${apt.serviceName} com ${apt.barberName}`
  })

  return `Seus agendamentos:\n\n${lines.join('\n\n')}`
}

/**
 * Format available time slots
 */
export function formatAvailableSlots(slots: AvailableSlot[], groupByBarber: boolean = false): string {
  if (slots.length === 0) {
    return 'Não há horários disponíveis para essa data.'
  }

  if (!groupByBarber) {
    // Simple list of times
    const times = [...new Set(slots.map((s) => s.time))]
      .sort()
      .map((time) => `⏰ ${time}`)
      .join('\n')
    return `Horários disponíveis:\n\n${times}`
  }

  // Group by barber
  const byBarber = new Map<string, string[]>()
  slots.forEach((slot) => {
    if (!byBarber.has(slot.barberName)) {
      byBarber.set(slot.barberName, [])
    }
    byBarber.get(slot.barberName)!.push(slot.time)
  })

  const lines: string[] = []
  byBarber.forEach((times, barberName) => {
    lines.push(`💈 ${barberName}:`)
    times.sort().forEach((time) => {
      lines.push(`   ⏰ ${time}`)
    })
  })

  return `Horários disponíveis:\n\n${lines.join('\n')}`
}

/**
 * Format service list
 */
export function formatServiceList(services: Service[]): string {
  if (services.length === 0) {
    return 'Nenhum serviço disponível.'
  }

  const lines = services.map((service, index) => {
    const price = service.price ? ` - R$ ${service.price.toFixed(2)}` : ''
    const duration = ` (${service.duration} min)`
    return `${index + 1}. ${service.name}${price}${duration}${service.description ? `\n   ${service.description}` : ''}`
  })

  return `Nossos serviços:\n\n${lines.join('\n\n')}`
}

/**
 * Format barber list
 */
export function formatBarberList(barbers: Barber[]): string {
  if (barbers.length === 0) {
    return 'Nenhum barbeiro disponível.'
  }

  const lines = barbers.map((barber, index) => {
    const specialties = barber.specialties && barber.specialties.length > 0 ? ` (${barber.specialties.join(', ')})` : ''
    return `${index + 1}. 💈 ${barber.name}${specialties}`
  })

  return `Nossos barbeiros:\n\n${lines.join('\n')}`
}

/**
 * Format draft summary (for confirmation)
 */
export function formatDraftSummary(draft: {
  service?: { name: string } | null
  barber?: { name: string } | null
  date?: string | null
  time?: string | null
  notes?: string | null
}): string {
  const lines: string[] = []

  if (draft.service) lines.push(`✂️ Serviço: ${draft.service.name}`)
  if (draft.barber) lines.push(`💈 Barbeiro: ${draft.barber.name}`)
  if (draft.date) lines.push(`📅 Data: ${formatDateFullBR(draft.date)}`)
  if (draft.time) lines.push(`⏰ Horário: ${draft.time}`)
  if (draft.notes) lines.push(`📝 Observações: ${draft.notes}`)

  return lines.join('\n')
}

/**
 * Format confirmation message
 */
export function formatConfirmationMessage(appointment: Appointment): string {
  return `✅ Agendamento confirmado!

${formatAppointmentSummary(appointment)}

Você receberá lembretes automáticos antes do horário. Até lá! 👋`
}

/**
 * Format cancellation message
 */
export function formatCancellationMessage(appointment: Appointment): string {
  const dateTime = new Date(appointment.dateTime)
  const date = dateTime.toISOString().split('T')[0]
  const time = dateTime.toTimeString().slice(0, 5)

  return `❌ Agendamento cancelado

${formatDateFullBR(date)} às ${time}
${appointment.serviceName} com ${appointment.barberName}

Se precisar remarcar, é só me chamar! 👋`
}

/**
 * Format reschedule message
 */
export function formatRescheduleMessage(oldAppointment: Appointment, newAppointment: Appointment): string {
  const oldDateTime = new Date(oldAppointment.dateTime)
  const oldDate = oldDateTime.toISOString().split('T')[0]
  const oldTime = oldDateTime.toTimeString().slice(0, 5)

  const newDateTime = new Date(newAppointment.dateTime)
  const newDate = newDateTime.toISOString().split('T')[0]
  const newTime = newDateTime.toTimeString().slice(0, 5)

  return `🔄 Agendamento remarcado!

De: ${formatDateBR(oldDate)} às ${oldTime}
Para: ${formatDateFullBR(newDate)} às ${newTime}

${newAppointment.serviceName} com ${newAppointment.barberName}

Você receberá lembretes para o novo horário. Até lá! 👋`
}
