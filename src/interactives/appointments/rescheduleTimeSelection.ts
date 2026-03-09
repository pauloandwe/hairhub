import { sendWhatsAppMessage } from '../../api/meta.api'
import { createSelectionFlow } from '../flows'
import { appointmentRescheduleService } from '../../services/appointments/appointment-reschedule.service'
import { appointmentRescheduleDraftService } from '../../services/appointments/appointment-reschedule-draft.service'
import { professionalService } from '../../services/appointments/professional.service'
import { SelectionItem } from '../../services/generic/generic.types'
import { tryContinueRegistration } from '../followup'
import { getSelectionAck } from '../../utils/conversation-copy'

export const RESCHEDULE_TIME_NAMESPACE = 'RESCHEDULE_TIME_SELECTION'

const timeSelectionFlow = createSelectionFlow<SelectionItem>({
  namespace: RESCHEDULE_TIME_NAMESPACE,
  type: 'rescheduleTimeSelect',
  fetchItems: async (phone) => {
    const appointment = appointmentRescheduleService.getSelectedAppointment(phone)
    const date = appointmentRescheduleService.getSelectedDate(phone)

    if (!appointment || !appointment.professionalId || !appointment.serviceId) {
      await sendWhatsAppMessage(phone, 'Perdi os dados desse agendamento. Vamos escolher de novo?')
      return []
    }

    if (!date) {
      await sendWhatsAppMessage(phone, 'Antes me fala qual nova data voce quer, ai eu te mostro os horarios.')
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
        await sendWhatsAppMessage(phone, 'Esse dia nao tem horarios livres com esse barbeiro. Quer tentar outra data?')
      }

      return slots.map<SelectionItem>((slot) => ({
        id: slot,
        name: slot,
        description: 'Escolher esse horario',
      }))
    } catch (error) {
      console.error('[RescheduleTimeSelection] Error fetching available slots:', error)
      await sendWhatsAppMessage(phone, 'Nao consegui carregar os horarios agora. Tenta de novo em instantes?')
      return []
    }
  },
  ui: {
    header: 'Escolha o horario',
    sectionTitle: 'Horários Disponíveis',
    buttonLabel: 'Ver horários',
  },
  defaultBody: 'Qual novo horario fica melhor pra voce?',
  invalidSelectionMsg: 'Esse horario nao esta mais livre. Vou te mostrar outras opcoes.',
  emptyListMessage: 'Nao achei horarios disponiveis para essa data.',
  pageLimit: 10,
  titleBuilder: (item, idx, base) => `${base + idx + 1}. ${item.name}`,
  descriptionBuilder: (item) => item.description,
  onSelected: async ({ userId, item }) => {
    try {
      await appointmentRescheduleService.setSelectedTime(userId, item.id)
      await appointmentRescheduleDraftService.updateDraftField(userId, 'newTime', item.id)
      await sendWhatsAppMessage(userId, getSelectionAck('newTime', item.name))
      await tryContinueRegistration(userId)
    } catch (error) {
      console.error('[RescheduleTimeSelection] Error confirming reschedule:', error)
      await sendWhatsAppMessage(userId, 'Nao consegui usar esse horario agora. Se quiser, tenta outro horario ou outra data.')
    }
  },
})

export async function sendRescheduleTimeSelectionList(userId: string, bodyMsg = 'Qual novo horario fica melhor pra voce?', offset = 0) {
  await timeSelectionFlow.sendList(userId, bodyMsg, offset)
}
