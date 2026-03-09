import { sendWhatsAppMessage } from '../../api/meta.api'
import { createSelectionFlow } from '../flows'
import { appointmentCancellationService } from '../../services/appointments/appointment-cancellation.service'
import { appointmentCancellationDraftService } from '../../services/appointments/appointment-cancellation-draft.service'
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

export const CANCEL_APPOINTMENT_NAMESPACE = 'CANCEL_APPOINTMENT_SELECTION'

const cancelAppointmentSelectionFlow = createSelectionFlow<SelectionItem & { serviceName?: string | null; professionalName?: string | null }>({
  namespace: CANCEL_APPOINTMENT_NAMESPACE,
  type: 'cancelAppointmentSelect',
  fetchItems: async (phone) => {
    const appointments = appointmentCancellationService.getUpcomingAppointmentsFromState(phone)

    if (!appointments.length) {
      await sendWhatsAppMessage(phone, 'Nao encontrei horarios em aberto para cancelar por aqui.')
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
  defaultBody: 'Qual horario voce quer cancelar?',
  invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mostrar seus horarios de novo.',
  emptyListMessage: 'Nao encontrei horarios em aberto para cancelar.',
  pageLimit: 10,
  titleBuilder: (item, idx, base) => `${base + idx + 1}. ${item.name}`,
  descriptionBuilder: (item) => buildDescription(item, { serviceName: item.serviceName, professionalName: item.professionalName }),
  onSelected: async ({ userId, item }) => {
    try {
      const appointmentId = Number(item.id)
      await appointmentCancellationService.selectAppointment(userId, appointmentId)
      await appointmentCancellationDraftService.updateDraftField(userId, 'appointmentId', appointmentId)
      await appointmentCancellationDraftService.hydrateSelectedAppointment(userId)
      await sendWhatsAppMessage(userId, getSelectionAck('appointment', item.name))
      await tryContinueRegistration(userId)
    } catch (error) {
      console.error('[CancelAppointmentSelection] Erro ao selecionar agendamento:', error)
      await sendWhatsAppMessage(userId, 'Nao consegui separar esse agendamento agora. Tenta de novo em instantes?')
    }
  },
})

export async function sendCancelableAppointmentSelectionList(userId: string, bodyMsg = 'Qual horario voce quer cancelar?', offset = 0) {
  await cancelAppointmentSelectionFlow.sendList(userId, bodyMsg, offset)
}
