import { sendWhatsAppMessage } from '../../api/meta.api'
import { createSelectionFlow } from '../flows'
import { appointmentRescheduleService } from '../../services/appointments/appointment-reschedule.service'
import { appointmentRescheduleDraftService } from '../../services/appointments/appointment-reschedule-draft.service'
import { professionalService, PUBLIC_SLOT_STEP_MINUTES } from '../../services/appointments/professional.service'
import { SelectionItem } from '../../services/generic/generic.types'
import { SelectionFlowAbortError } from '../flows'
import { tryContinueRegistration } from '../followup'
import { getSelectionAck } from '../../utils/conversation-copy'

export const RESCHEDULE_DATE_NAMESPACE = 'RESCHEDULE_DATE_SELECTION'

async function abortRescheduleDateSelection(phone: string, message: string, context: Record<string, unknown>): Promise<never> {
  await sendWhatsAppMessage(phone, message)
  throw new SelectionFlowAbortError(message, context)
}

const dateSelectionFlow = createSelectionFlow<SelectionItem>({
  namespace: RESCHEDULE_DATE_NAMESPACE,
  type: 'rescheduleDateSelect',
  fetchItems: async (phone) => {
    const appointment = appointmentRescheduleService.getSelectedAppointment(phone)

    if (!appointment) {
      return abortRescheduleDateSelection(phone, 'Perdi qual agendamento voce quer remarcar. Vamos escolher de novo?', {
        phone,
        reason: 'missing_selected_appointment',
      })
    }

    if (!appointment.professionalId || !appointment.serviceId) {
      console.warn('[RescheduleDateSelection] Missing professional/service for appointment:', appointment)
      return abortRescheduleDateSelection(phone, 'Nao consegui identificar os dados desse agendamento para te sugerir novas datas.', {
        phone,
        appointmentId: appointment.id,
        professionalId: appointment.professionalId,
        serviceId: appointment.serviceId,
        reason: 'missing_appointment_fields',
      })
    }

    try {
      const days = await professionalService.getAvailableDays({
        phone,
        professionalId: appointment.professionalId,
        serviceId: appointment.serviceId,
        stepMinutes: PUBLIC_SLOT_STEP_MINUTES,
      })

      if (!days.length) {
        return abortRescheduleDateSelection(phone, 'Nao achei novas datas livres com esse barbeiro nos proximos dias.', {
          phone,
          appointmentId: appointment.id,
          professionalId: appointment.professionalId,
          serviceId: appointment.serviceId,
          reason: 'empty_days',
        })
      }

      return days
    } catch (error) {
      console.error('[RescheduleDateSelection] Error fetching available days:', error)
      return abortRescheduleDateSelection(phone, 'Nao consegui carregar as novas datas agora. Tenta de novo em instantes?', {
        phone,
        appointmentId: appointment.id,
        professionalId: appointment.professionalId,
        serviceId: appointment.serviceId,
        reason: 'availability_fetch_error',
      })
    }
  },
  ui: {
    header: 'Escolha a nova data',
    sectionTitle: 'Datas Disponíveis',
    buttonLabel: 'Ver datas',
  },
  defaultBody: 'Qual novo dia fica melhor pra voce?',
  invalidSelectionMsg: 'Essa data nao esta mais livre. Vou te mostrar outras opcoes.',
  emptyListMessage: 'Nao encontrei novas datas disponiveis agora.',
  pageLimit: 10,
  titleBuilder: (item, idx, base) => `${base + idx + 1}. ${item.name}`,
  descriptionBuilder: (item) => item.description,
  onSelected: async ({ userId, item }) => {
    try {
      await appointmentRescheduleService.setSelectedDate(userId, item.id)
      await appointmentRescheduleDraftService.updateDraftField(userId, 'newDate', item.id)
      await sendWhatsAppMessage(userId, getSelectionAck('newDate', item.name))
      await tryContinueRegistration(userId)
    } catch (error) {
      console.error('[RescheduleDateSelection] Error handling selected date:', error)
      await sendWhatsAppMessage(userId, 'Nao consegui usar essa data agora. Tenta de novo em instantes?')
    }
  },
})

export async function sendRescheduleDateSelectionList(userId: string, bodyMsg = 'Qual novo dia fica melhor pra voce?', offset = 0) {
  await dateSelectionFlow.sendList(userId, bodyMsg, offset)
}
