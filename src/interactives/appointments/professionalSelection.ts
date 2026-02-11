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

export const PROFESSIONAL_NAMESPACE = 'BARBER_GROUP'

const professionalFlow = createSelectionFlow<SelectionItem>({
  namespace: PROFESSIONAL_NAMESPACE,
  type: 'selectProfessional',
  fetchItems: async (phone) => {
    const professionals = await professionalService.getProfessionals(phone)
    if (professionals.length === 0) {
      return []
    }

    return [{ id: 'ANY', name: 'Nenhum específico' }, ...professionals]
  },
  ui: {
    header: 'Escolha o Professional',
    sectionTitle: 'Profissionais Disponíveis',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Qual professional você prefere?',
  invalidSelectionMsg: 'Seleção inválida ou expirada. Reenviando a lista.',
  emptyListMessage: 'Nenhum profissional com horários configurados. Configure os dias e horários na tela de Profissionais.',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => {
    if (c.id === 'ANY') {
      return `${c.name}`
    }
    return `${base + idx}. ${c.name}`
  },
  descriptionBuilder: (c) => {
    if (c.id === 'ANY') return 'Sistema escolherá o melhor profissional'
    return 'Toque para selecionar'
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
      await sendWhatsAppMessage(userId, `✅ Profissional será atribuído automaticamente com base na disponibilidade!`)
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
      await sendWhatsAppMessage(userId, `✅ Professional '${item.name}' selecionado com sucesso!`)
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

export async function sendProfessionalSelectionList(userId: string, bodyMsg = 'Qual professional você prefere?', offset = 0) {
  await professionalFlow.sendList(userId, bodyMsg, offset)
}
