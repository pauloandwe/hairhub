import { sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { AppointmentFields } from '../../enums/cruds/appointmentFields.enum'
import { getUserContext, setUserContext, getUserContextSync } from '../../env.config'
import { appointmentService } from '../../services/appointments/appointmentService'
import { barberService } from '../../services/appointments/barber.service'
import { SelectionItem } from '../../services/generic/generic.types'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'
import { UpsertAppointmentArgs } from '../../services/appointments/appointment.types'

export const TIME_SLOT_NAMESPACE = 'TIME_SLOT_GROUP'

const timeSlotFlow = createSelectionFlow<SelectionItem>({
  namespace: TIME_SLOT_NAMESPACE,
  type: 'selectTimeSlot',
  fetchItems: async (phone) => {
    const ctx = getUserContextSync(phone)
    const draft = await appointmentService.loadDraft(phone)

    // Get available slots based on selected date and service
    const slots = await barberService.getAvailableSlots(
      phone,
      draft.appointmentDate || undefined,
      draft.service?.id ? Number(draft.service.id) : undefined,
    )

    // Convert time strings to SelectionItem format
    return slots.map((slot) => ({
      id: slot,
      name: slot,
    }))
  },
  ui: {
    header: 'Escolha o Horário',
    sectionTitle: 'Horários',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Qual horário você prefere?',
  invalidSelectionMsg: 'Seleção inválida ou expirada. Reenviando a lista.',
  emptyListMessage: 'Nenhum horário disponível para o período selecionado',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Selecionar este horário',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)

    await setUserContext(userId, {
      timeSlot: item.id,
    })

    if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.Appointment) {
      await appointmentService.updateDraftField(userId, AppointmentFields.TIME as keyof UpsertAppointmentArgs, item.id)
    }
    await sendWhatsAppMessage(userId, `Horário '${item.name}' selecionado.`)
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    const updates: Partial<UpsertAppointmentArgs> = {
      appointmentTime: item.id,
    }

    await appointmentService.updateDraft(userId, updates)
    await sendWhatsAppMessage(userId, `Horário alterado para '${item.name}'.`)
  },
})

export async function sendTimeSlotSelectionList(userId: string, bodyMsg = 'Qual horário você prefere?', offset = 0) {
  await timeSlotFlow.sendList(userId, bodyMsg, offset)
}
