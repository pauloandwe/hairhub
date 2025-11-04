import { sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { AppointmentFields } from '../../enums/cruds/appointmentFields.enum'
import { getUserContext, setUserContext, getUserContextSync } from '../../env.config'
import { appointmentService } from '../../services/appointments/appointmentService'
import { professionalService } from '../../services/appointments/professional.service'
import { SelectionItem } from '../../services/generic/generic.types'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'
import { UpsertAppointmentArgs } from '../../services/appointments/appointment.types'
import { appointmentFunctions } from '../../functions/appointments/appointment.functions'

export const TIME_SLOT_NAMESPACE = 'TIME_SLOT_GROUP'

type SlotProfessional = { id: string; name?: string | null }
type TimeSlotSelectionItem = SelectionItem & { availableProfessionals?: SlotProfessional[] }

const timeSlotFlow = createSelectionFlow<TimeSlotSelectionItem>({
  namespace: TIME_SLOT_NAMESPACE,
  type: 'selectTimeSlot',
  fetchItems: async (phone) => {
    const draft = await appointmentService.loadDraft(phone)
    const serviceId = draft.service?.id ? Number(draft.service.id) : null
    const professionalId = draft.professional?.id ? Number(draft.professional.id) : null
    const date = draft.appointmentDate ?? null

    let slots: TimeSlotSelectionItem[] = []

    if (professionalId === null) {
      console.info('[timeSlotFlow] Buscando horários agregados (profissional não específico)', { phone, date, serviceId })
      if (!date) {
        console.warn('[timeSlotFlow] Data não definida ao buscar horários agregados.', { phone })
        return []
      }

      const aggregatedSlots = await professionalService.getAvailableSlotsAggregated({
        phone,
        date,
        ...(serviceId !== null ? { serviceId } : {}),
      })

      if (!aggregatedSlots.length) {
        console.info('[timeSlotFlow] Nenhum horário disponível (agregado).', { phone, date, serviceId })
        return []
      }

      slots = aggregatedSlots.map((slot) => ({
        id: slot.start,
        name: slot.start,
        availableProfessionals: slot.professionals,
      }))
    } else {
      const professionalSlots = await professionalService.getAvailableSlots({
        phone,
        professionalId,
        date,
        serviceId,
      })

      slots = professionalSlots.map((slot) => ({
        id: slot,
        name: slot,
        availableProfessionals: [
          {
            id: String(professionalId),
            name: draft.professional?.name ?? String(professionalId),
          },
        ],
      }))
    }

    return slots
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

    const context = getUserContextSync(userId)
    const inAppointmentFlow = context?.activeRegistration?.type === FlowType.Appointment
    const hasUserDefinedProfessional = Boolean(context?.professionalId) && !context?.autoAssignedProfessional
    const hadAutoAssignedPreviously = Boolean(context?.autoAssignedProfessional)

    const availableProfessionalsRaw = Array.isArray(item.availableProfessionals) ? item.availableProfessionals : []
    const availableProfessionals = availableProfessionalsRaw.filter((pro): pro is SlotProfessional => Boolean(pro && pro.id && String(pro.id).trim()))

    if (Array.isArray(item.availableProfessionals) && availableProfessionals.length === 0) {
      console.warn('[timeSlotFlow] Horário selecionado sem profissionais disponíveis.', { userId, slot: item.id })
      await sendWhatsAppMessage(userId, 'Esse horário não está mais disponível. Vou enviar a lista atualizada.')
      await sendTimeSlotSelectionList(userId)
      return
    }

    let autoAssignedProfessional: SlotProfessional | null = null
    let clearedAutoAssignment = false

    if (!hasUserDefinedProfessional && availableProfessionals.length === 1 && inAppointmentFlow) {
      const singleProfessional = availableProfessionals[0]
      autoAssignedProfessional = singleProfessional
      await appointmentService.updateDraftField(
        userId,
        AppointmentFields.PROFESSIONAL as keyof UpsertAppointmentArgs,
        {
          id: singleProfessional.id,
          name: singleProfessional.name ?? null,
        } as unknown as UpsertAppointmentArgs[keyof UpsertAppointmentArgs],
      )
    } else if (hadAutoAssignedPreviously && availableProfessionals.length !== 1 && inAppointmentFlow) {
      await appointmentService.updateDraftField(userId, AppointmentFields.PROFESSIONAL as keyof UpsertAppointmentArgs, null as unknown as UpsertAppointmentArgs[keyof UpsertAppointmentArgs])
      clearedAutoAssignment = true
    }

    const contextUpdates: Record<string, any> = {
      timeSlot: item.id,
      availableProfessionalIdsForSlot: availableProfessionals.length > 1 ? availableProfessionals.map((pro) => String(pro.id)) : null,
    }

    if (autoAssignedProfessional) {
      contextUpdates.professionalId = String(autoAssignedProfessional.id)
      contextUpdates.professionalName = autoAssignedProfessional.name ?? 'Profissional disponível'
      contextUpdates.autoAssignedProfessional = true
    } else if (clearedAutoAssignment) {
      contextUpdates.professionalId = null
      contextUpdates.professionalName = 'Qualquer profissional'
      contextUpdates.autoAssignedProfessional = false
    } else if (!hasUserDefinedProfessional && !availableProfessionals.length) {
      contextUpdates.autoAssignedProfessional = false
    }

    await setUserContext(userId, contextUpdates)

    if (inAppointmentFlow) {
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
