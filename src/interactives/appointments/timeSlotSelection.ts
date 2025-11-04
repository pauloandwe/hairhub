import { sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { AppointmentFields } from '../../enums/cruds/appointmentFields.enum'
import { getUserContext, setUserContext, getUserContextSync, getBusinessPhoneForPhone } from '../../env.config'
import { appointmentService } from '../../services/appointments/appointmentService'
import { professionalService } from '../../services/appointments/professional.service'
import { SelectionItem } from '../../services/generic/generic.types'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'
import { UpsertAppointmentArgs } from '../../services/appointments/appointment.types'
import { appointmentFunctions } from '../../functions/appointments/appointment.functions'

export const TIME_SLOT_NAMESPACE = 'TIME_SLOT_GROUP'

const timeSlotFlow = createSelectionFlow<SelectionItem>({
  namespace: TIME_SLOT_NAMESPACE,
  type: 'selectTimeSlot',
  fetchItems: async (phone) => {
    const draft = await appointmentService.loadDraft(phone)
    const serviceId = draft.service?.id ? Number(draft.service.id) : null
    const professionalId = draft.professional?.id ? Number(draft.professional.id) : null
    const date = draft.appointmentDate ?? null

    let slots: string[] = []

    // If professional is null (user selected "Nenhum específico"), get aggregated slots from all professionals
    if (professionalId === null) {
      console.info('[timeSlotFlow] Buscando horários agregados (profissional não específico)', { phone, date, serviceId })
      if (!date) {
        console.warn('[timeSlotFlow] Data não definida ao buscar horários agregados.', { phone })
        return []
      }

      slots = await professionalService.getAvailableSlotsAggregated({
        phone,
        date,
        ...(serviceId !== null ? { serviceId } : {}),
      })
    } else {
      // Otherwise, get slots for the specific professional
      slots = await professionalService.getAvailableSlots({
        phone,
        professionalId,
        date,
        serviceId,
      })
    }

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
      await appointmentService.updateDraftField(userId, AppointmentFields.APPOINTMENT_TIME as keyof UpsertAppointmentArgs, item.id)
    }
    await sendWhatsAppMessage(userId, `Horário '${item.name}' selecionado.`)
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    await setUserContext(userId, {
      timeSlot: item.id,
    })

    await appointmentFunctions.applyAppointmentRecordUpdates({
      phone: userId,
      updates: { appointmentTime: item.id } as Partial<UpsertAppointmentArgs>,
      logContext: `Horário atualizado para ${item.name}`,
    })
  },
})

export async function sendTimeSlotSelectionList(userId: string, bodyMsg = 'Qual horário você prefere?', offset = 0) {
  await timeSlotFlow.sendList(userId, bodyMsg, offset)
}
