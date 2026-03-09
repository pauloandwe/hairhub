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
import { getSelectionAck } from '../../utils/conversation-copy'

export const PROFESSIONAL_NAMESPACE = 'BARBER_GROUP'

const professionalFlow = createSelectionFlow<SelectionItem>({
  namespace: PROFESSIONAL_NAMESPACE,
  type: 'selectProfessional',
  fetchItems: async (phone) => {
    const draft = await appointmentService.loadDraft(phone)
    const serviceId = draft.service?.id ?? null
    const professionals = await professionalService.getProfessionals(phone, serviceId)
    if (professionals.length === 0) {
      return []
    }

    return [{ id: 'ANY', name: 'Nenhum específico' }, ...professionals]
  },
  ui: {
    header: 'Escolha o barbeiro',
    sectionTitle: 'Profissionais Disponíveis',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Tem preferencia de barbeiro?',
  invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
  emptyListMessage: 'Nao encontrei profissionais com horario disponivel agora.',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => {
    if (c.id === 'ANY') {
      return `${c.name}`
    }
    return `${base + idx}. ${c.name}`
  },
  descriptionBuilder: (c) => {
    if (c.id === 'ANY') return 'A gente escolhe pelo horario disponivel'
    return 'Toque para escolher'
  },
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)

    if (item.id === 'ANY') {
      await setUserContext(userId, {
        professionalId: null,
        professionalName: 'Qualquer profissional',
        autoAssignedProfessional: false,
        availableProfessionalIdsForSlot: null,
      })

      if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.Appointment) {
        await appointmentService.updateDraftField(userId, AppointmentFields.PROFESSIONAL as keyof UpsertAppointmentArgs, null)
      }
      await sendWhatsAppMessage(userId, 'Perfeito, vou buscar o melhor profissional disponivel para esse horario.')
    } else {
      await setUserContext(userId, {
        professionalId: item.id,
        professionalName: item.name,
        autoAssignedProfessional: false,
        availableProfessionalIdsForSlot: null,
      })

      if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.Appointment) {
        await appointmentService.updateDraftField(userId, AppointmentFields.PROFESSIONAL as keyof UpsertAppointmentArgs, { id: item.id, name: item.name })
      }
      await sendWhatsAppMessage(userId, getSelectionAck('professional', item.name))
    }

    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    if (item.id === 'ANY') {
      await setUserContext(userId, {
        professionalId: null,
        professionalName: 'Qualquer profissional',
        autoAssignedProfessional: false,
        availableProfessionalIdsForSlot: null,
      })

      await appointmentFunctions.applyAppointmentRecordUpdates({
        phone: userId,
        updates: { professional: null } as Partial<UpsertAppointmentArgs>,
        logContext: 'Professional atualizado para: qualquer profissional',
      })
    } else {
      await setUserContext(userId, {
        professionalId: item.id,
        professionalName: item.name,
        autoAssignedProfessional: false,
        availableProfessionalIdsForSlot: null,
      })

      await appointmentFunctions.applyAppointmentRecordUpdates({
        phone: userId,
        updates: { professional: { id: item.id, name: item.name } } as Partial<UpsertAppointmentArgs>,
        logContext: `Professional atualizado para ${item.name}`,
      })
    }
  },
})

export async function sendProfessionalSelectionList(userId: string, bodyMsg = 'Tem preferencia de barbeiro?', offset = 0) {
  await professionalFlow.sendList(userId, bodyMsg, offset)
}
