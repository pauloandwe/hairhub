import { sendWhatsAppMessage } from '../../api/meta.api'
import { createSelectionFlow } from '../flows'
import { appointmentRescheduleService } from '../../services/appointments/appointment-reschedule.service'
import { appointmentRescheduleDraftService } from '../../services/appointments/appointment-reschedule-draft.service'
import { professionalService } from '../../services/appointments/professional.service'
import { SelectionItem } from '../../services/generic/generic.types'
import { tryContinueRegistration } from '../followup'

export const RESCHEDULE_TIME_NAMESPACE = 'RESCHEDULE_TIME_SELECTION'

const timeSelectionFlow = createSelectionFlow<SelectionItem>({
  namespace: RESCHEDULE_TIME_NAMESPACE,
  type: 'rescheduleTimeSelect',
  fetchItems: async (phone) => {
    const appointment = appointmentRescheduleService.getSelectedAppointment(phone)
    const date = appointmentRescheduleService.getSelectedDate(phone)

    if (!appointment || !appointment.professionalId || !appointment.serviceId) {
      await sendWhatsAppMessage(phone, 'Não tenho os dados do agendamento para listar horários. Volte e selecione o agendamento novamente.')
      return []
    }

    if (!date) {
      await sendWhatsAppMessage(phone, 'Antes escolha uma nova data para ver os horários disponíveis.')
      return []
    }

    try {
      const slots = await professionalService.getAvailableSlots({
        phone,
        professionalId: appointment.professionalId,
        serviceId: appointment.serviceId,
        date,
      })

      if (!slots.length) {
        await sendWhatsAppMessage(phone, 'Esse dia não tem horários disponíveis com o professional escolhido. Que tal tentar outra data?')
      }

      return slots.map<SelectionItem>((slot) => ({
        id: slot,
        name: slot,
        description: 'Selecionar este horário',
      }))
    } catch (error) {
      console.error('[RescheduleTimeSelection] Error fetching available slots:', error)
      await sendWhatsAppMessage(phone, 'Não consegui carregar os horários agora. Tente novamente mais tarde.')
      return []
    }
  },
  ui: {
    header: 'Escolha o Horário',
    sectionTitle: 'Horários Disponíveis',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver horários',
  },
  defaultBody: 'Qual horário você prefere?',
  invalidSelectionMsg: 'Esse horário não está mais disponível. Escolha outro, por favor.',
  emptyListMessage: 'Nenhum horário disponível para esta data.',
  pageLimit: 10,
  titleBuilder: (item, idx, base) => `${base + idx + 1}. ${item.name}`,
  descriptionBuilder: (item) => item.description,
  onSelected: async ({ userId, item }) => {
    try {
      await appointmentRescheduleService.setSelectedTime(userId, item.id)
      await appointmentRescheduleDraftService.updateDraftField(userId, 'newTime', item.id)
      await sendWhatsAppMessage(userId, `Horário '${item.name}' selecionado.`)
      await tryContinueRegistration(userId)
    } catch (error) {
      console.error('[RescheduleTimeSelection] Error confirming reschedule:', error)
      await sendWhatsAppMessage(userId, 'Não consegui remarcar com esse horário. Tente outro horário ou dia, por favor.')
    }
  },
})

export async function sendRescheduleTimeSelectionList(userId: string, bodyMsg = 'Qual horário você prefere?', offset = 0) {
  await timeSelectionFlow.sendList(userId, bodyMsg, offset)
}
