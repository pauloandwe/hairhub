import { sendWhatsAppMessage } from '../../api/meta.api'
import { createSelectionFlow } from '../flows'
import { appointmentRescheduleService } from '../../services/appointments/appointment-reschedule.service'
import { appointmentRescheduleDraftService } from '../../services/appointments/appointment-reschedule-draft.service'
import { SelectionItem } from '../../services/generic/generic.types'
import { DateFormatter } from '../../utils/date'
import { tryContinueRegistration } from '../followup'
import { getSelectionAck } from '../../utils/conversation-copy'

const buildTitle = (startDate: string): string => {
  const dayMonth = DateFormatter.formatToDayMonth(startDate) ?? 'Data indefinida'
  const time = DateFormatter.formatToHourMinute(startDate)
  return time ? `${dayMonth} às ${time}` : dayMonth
}

const buildDescription = (item: SelectionItem, source?: { serviceName?: string | null; professionalName?: string | null }): string | undefined => {
  const service = source?.serviceName?.trim() ?? ''
  const professional = source?.professionalName?.trim() ?? ''

  if (service && professional) {
    return `${service} • ${professional}`
  }

  if (service) return service
  if (professional) return professional
  return item.description
}

export const RESCHEDULE_APPOINTMENT_NAMESPACE = 'RESCHEDULE_APPOINTMENT_SELECTION'

const appointmentSelectionFlow = createSelectionFlow<SelectionItem & { serviceName?: string | null; professionalName?: string | null }>({
  namespace: RESCHEDULE_APPOINTMENT_NAMESPACE,
  type: 'rescheduleAppointmentSelect',
  fetchItems: async (phone) => {
    const appointments = appointmentRescheduleService.getPendingAppointmentsFromState(phone)

    if (!appointments.length) {
      await sendWhatsAppMessage(phone, 'Nao encontrei horarios em aberto para remarcar por aqui.')
      return []
    }

    return appointments.map((appointment) => ({
      id: String(appointment.id),
      name: buildTitle(appointment.startDate),
      description: appointment.serviceName ?? undefined,
      serviceName: appointment.serviceName ?? undefined,
      professionalName: appointment.professionalName ?? undefined,
    }))
  },
  ui: {
    header: 'Escolha o agendamento',
    sectionTitle: 'Próximos Agendamentos',
    buttonLabel: 'Ver horários',
  },
  defaultBody: 'Qual horario voce quer remarcar?',
  invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mostrar seus horarios de novo.',
  emptyListMessage: 'Voce nao tem horarios em aberto para remarcar agora.',
  pageLimit: 10,
  titleBuilder: (item, idx, base) => `${base + idx + 1}. ${item.name}`,
  descriptionBuilder: (item) => buildDescription(item, { serviceName: item.serviceName, professionalName: item.professionalName }),
  onSelected: async ({ userId, item }) => {
    try {
      const appointmentId = Number(item.id)
      await appointmentRescheduleService.selectAppointment(userId, appointmentId)
      await appointmentRescheduleDraftService.updateDraftField(userId, 'appointmentId', appointmentId)
      await appointmentRescheduleDraftService.hydrateSelectedAppointment(userId)
      await sendWhatsAppMessage(userId, getSelectionAck('appointment', item.name))
      await tryContinueRegistration(userId)
    } catch (error) {
      console.error('[RescheduleAppointmentSelection] Erro ao selecionar agendamento:', error)
      await sendWhatsAppMessage(userId, 'Nao consegui separar esse agendamento agora. Tenta de novo em instantes?')
    }
  },
})

export async function sendPendingAppointmentSelectionList(userId: string, bodyMsg = 'Qual horario voce quer remarcar?', offset = 0) {
  await appointmentSelectionFlow.sendList(userId, bodyMsg, offset)
}
