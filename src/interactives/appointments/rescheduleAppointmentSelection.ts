import { sendWhatsAppMessage } from '../../api/meta.api'
import { createSelectionFlow } from '../flows'
import { appointmentRescheduleService } from '../../services/appointments/appointment-reschedule.service'
import { appointmentRescheduleDraftService } from '../../services/appointments/appointment-reschedule-draft.service'
import { SelectionItem } from '../../services/generic/generic.types'
import { DateFormatter } from '../../utils/date'
import { tryContinueRegistration } from '../followup'

const buildTitle = (startDate: string): string => {
  const dayMonth = DateFormatter.formatToDayMonth(startDate) ?? 'Data indefinida'
  const time = DateFormatter.formatToHourMinute(startDate)
  return time ? `${dayMonth} às ${time}` : dayMonth
}

const buildDescription = (item: SelectionItem, source?: { serviceName?: string | null; barberName?: string | null }): string | undefined => {
  const service = source?.serviceName?.trim() ?? ''
  const barber = source?.barberName?.trim() ?? ''

  if (service && barber) {
    return `${service} • ${barber}`
  }

  if (service) return service
  if (barber) return barber
  return item.description
}

export const RESCHEDULE_APPOINTMENT_NAMESPACE = 'RESCHEDULE_APPOINTMENT_SELECTION'

const appointmentSelectionFlow = createSelectionFlow<SelectionItem & { serviceName?: string | null; barberName?: string | null }>({
  namespace: RESCHEDULE_APPOINTMENT_NAMESPACE,
  type: 'rescheduleAppointmentSelect',
  fetchItems: async (phone) => {
    const appointments = appointmentRescheduleService.getPendingAppointmentsFromState(phone)

    if (!appointments.length) {
      await sendWhatsAppMessage(phone, 'Não encontrei agendamentos pendentes para remarcar.')
      return []
    }

    return appointments.map((appointment) => ({
      id: String(appointment.id),
      name: buildTitle(appointment.startDate),
      description: appointment.serviceName ?? undefined,
      serviceName: appointment.serviceName ?? undefined,
      barberName: appointment.barberName ?? undefined,
    }))
  },
  ui: {
    header: 'Escolha o Agendamento',
    sectionTitle: 'Agendamentos Pendentes',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver horários',
  },
  defaultBody: 'Qual agendamento você quer remarcar?',
  invalidSelectionMsg: 'Essa opção não é mais válida. Escolha novamente, por favor.',
  emptyListMessage: 'Você não tem agendamentos pendentes para remarcar.',
  pageLimit: 10,
  titleBuilder: (item, idx, base) => `${base + idx + 1}. ${item.name}`,
  descriptionBuilder: (item) => buildDescription(item, { serviceName: item.serviceName, barberName: item.barberName }),
  onSelected: async ({ userId, item }) => {
    try {
      const appointmentId = Number(item.id)
      await appointmentRescheduleService.selectAppointment(userId, appointmentId)
      await appointmentRescheduleDraftService.updateDraftField(userId, 'appointmentId', appointmentId)
      await appointmentRescheduleDraftService.hydrateSelectedAppointment(userId)
      await sendWhatsAppMessage(userId, `Agendamento '${item.name}' selecionado.`)
      await tryContinueRegistration(userId)
    } catch (error) {
      console.error('[RescheduleAppointmentSelection] Erro ao selecionar agendamento:', error)
      await sendWhatsAppMessage(userId, 'Não consegui selecionar esse agendamento agora. Tente novamente mais tarde.')
    }
  },
})

export async function sendPendingAppointmentSelectionList(userId: string, bodyMsg = 'Qual agendamento você quer remarcar?', offset = 0) {
  await appointmentSelectionFlow.sendList(userId, bodyMsg, offset)
}
