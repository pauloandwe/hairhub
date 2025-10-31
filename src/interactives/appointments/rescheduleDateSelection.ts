import { sendWhatsAppMessage } from '../../api/meta.api'
import { createSelectionFlow } from '../flows'
import { appointmentRescheduleService } from '../../services/appointments/appointment-reschedule.service'
import { appointmentRescheduleDraftService } from '../../services/appointments/appointment-reschedule-draft.service'
import { barberService } from '../../services/appointments/barber.service'
import { SelectionItem } from '../../services/generic/generic.types'
import { tryContinueRegistration } from '../followup'

export const RESCHEDULE_DATE_NAMESPACE = 'RESCHEDULE_DATE_SELECTION'

const dateSelectionFlow = createSelectionFlow<SelectionItem>({
  namespace: RESCHEDULE_DATE_NAMESPACE,
  type: 'rescheduleDateSelect',
  fetchItems: async (phone) => {
    const appointment = appointmentRescheduleService.getSelectedAppointment(phone)

    if (!appointment) {
      await sendWhatsAppMessage(phone, 'Não identifiquei qual agendamento vamos remarcar. Volte e selecione o agendamento primeiro.')
      return []
    }

    if (!appointment.barberId || !appointment.serviceId) {
      console.warn('[RescheduleDateSelection] Missing barber/service for appointment:', appointment)
      await sendWhatsAppMessage(phone, 'Esse agendamento não tem barbeiro ou serviço vinculados. Não consigo sugerir novas datas.')
      return []
    }

    try {
      const days = await barberService.getAvailableDays({
        phone,
        barberId: appointment.barberId,
        serviceId: appointment.serviceId,
      })

      if (!days.length) {
        await sendWhatsAppMessage(phone, 'Não encontrei datas disponíveis para os próximos dias com esse barbeiro.')
      }

      return days
    } catch (error) {
      console.error('[RescheduleDateSelection] Error fetching available days:', error)
      await sendWhatsAppMessage(phone, 'Não consegui carregar as datas disponíveis agora. Tente novamente mais tarde.')
      return []
    }
  },
  ui: {
    header: 'Escolha a Nova Data',
    sectionTitle: 'Datas Disponíveis',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver datas',
  },
  defaultBody: 'Qual nova data você prefere?',
  invalidSelectionMsg: 'Essa data não está mais disponível. Escolha outra, por favor.',
  emptyListMessage: 'Nenhuma data disponível encontrada.',
  pageLimit: 10,
  titleBuilder: (item, idx, base) => `${base + idx + 1}. ${item.name}`,
  descriptionBuilder: (item) => item.description,
  onSelected: async ({ userId, item }) => {
    try {
      await appointmentRescheduleService.setSelectedDate(userId, item.id)
      await appointmentRescheduleDraftService.updateDraftField(userId, 'newDate', item.id)
      await sendWhatsAppMessage(userId, `Data '${item.name}' selecionada.`)
      await tryContinueRegistration(userId)
    } catch (error) {
      console.error('[RescheduleDateSelection] Error handling selected date:', error)
      await sendWhatsAppMessage(userId, 'Não consegui usar essa data no momento. Tente novamente mais tarde.')
    }
  },
})

export async function sendRescheduleDateSelectionList(userId: string, bodyMsg = 'Qual data você prefere?', offset = 0) {
  await dateSelectionFlow.sendList(userId, bodyMsg, offset)
}
