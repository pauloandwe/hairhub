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

type ProfessionalSelectionDispatchResult = {
  interactive: boolean
  autoSelected: boolean
}

async function getEligibleProfessionalsForSelection(phone: string): Promise<SelectionItem[]> {
  const draft = await appointmentService.loadDraft(phone)
  const serviceId = draft.service?.id ?? null
  const professionals = await professionalService.getProfessionals(phone, serviceId)
  const allowedProfessionalIds = Array.isArray(getUserContextSync(phone)?.availableProfessionalIdsForSlot)
    ? new Set(getUserContextSync(phone)?.availableProfessionalIdsForSlot.map((id: string) => String(id)))
    : null
  const filteredProfessionals =
    allowedProfessionalIds && allowedProfessionalIds.size > 0
      ? professionals.filter((professional) => allowedProfessionalIds.has(String(professional.id)))
      : professionals

  if (allowedProfessionalIds && allowedProfessionalIds.size > 0) {
    console.info('[professionalFlow] Filtering professionals to keep the preserved slot.', {
      phone,
      serviceId,
      appointmentDate: draft.appointmentDate,
      appointmentTime: draft.appointmentTime,
      allowedProfessionalIds: Array.from(allowedProfessionalIds),
      filteredCount: filteredProfessionals.length,
    })
  }

  return filteredProfessionals
}

async function autoSelectSingleProfessional(userId: string, professional: SelectionItem, editMode: boolean): Promise<void> {
  await setUserContext(userId, {
    professionalId: professional.id,
    professionalName: professional.name,
    autoAssignedProfessional: true,
    availableProfessionalIdsForSlot: null,
  })

  if (editMode) {
    await appointmentFunctions.applyAppointmentRecordUpdates({
      phone: userId,
      updates: {
        professional: {
          id: professional.id,
          name: professional.name,
        },
      } as Partial<UpsertAppointmentArgs>,
      logContext: `Professional atualizado automaticamente para ${professional.name}`,
    })
    return
  }

  if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.Appointment) {
    await appointmentService.updateDraftField(userId, AppointmentFields.PROFESSIONAL as keyof UpsertAppointmentArgs, {
      id: professional.id,
      name: professional.name,
    })
  }

  await sendWhatsAppMessage(userId, getSelectionAck('professional', professional.name))
  await tryContinueRegistration(userId)
}

const professionalFlow = createSelectionFlow<SelectionItem>({
  namespace: PROFESSIONAL_NAMESPACE,
  type: 'selectProfessional',
  fetchItems: async (phone) => {
    const filteredProfessionals = await getEligibleProfessionalsForSelection(phone)
    if (filteredProfessionals.length === 0) {
      return []
    }

    return [{ id: 'ANY', name: 'Nenhum específico' }, ...filteredProfessionals]
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

export async function sendProfessionalSelectionList(userId: string, bodyMsg = 'Tem preferencia de barbeiro?', offset = 0): Promise<ProfessionalSelectionDispatchResult> {
  const isEditMode = Boolean(getUserContextSync(userId)?.activeRegistration?.editMode)
  const draft = await appointmentService.loadDraft(userId)
  const hasResolvedService = Boolean(draft.service?.id)

  if (offset === 0 && hasResolvedService) {
    const eligibleProfessionals = await getEligibleProfessionalsForSelection(userId)
    if (eligibleProfessionals.length === 1) {
      const [singleProfessional] = eligibleProfessionals
      console.info('[professionalFlow] Auto-selecting single eligible professional.', {
        userId,
        professionalId: singleProfessional.id,
        professionalName: singleProfessional.name,
        editMode: isEditMode,
      })
      await autoSelectSingleProfessional(userId, singleProfessional, isEditMode)
      return { interactive: false, autoSelected: true }
    }
  }

  await professionalFlow.sendList(userId, bodyMsg, offset)
  return { interactive: true, autoSelected: false }
}
