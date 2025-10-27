import { sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { AppointmentFields } from '../../enums/cruds/appointmentFields.enum'
import { getUserContext, setUserContext, getUserContextSync } from '../../env.config'
import { appointmentService } from '../../services/appointments/appointmentService'
import { serviceService } from '../../services/appointments/service.service'
import { SelectionItem } from '../../services/generic/generic.types'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'
import { UpsertAppointmentArgs } from '../../services/appointments/appointment.types'

export const SERVICE_NAMESPACE = 'SERVICE_GROUP'

const serviceFlow = createSelectionFlow<SelectionItem>({
  namespace: SERVICE_NAMESPACE,
  type: 'selectService',
  fetchItems: async (phone) => {
    return serviceService.getServices(phone)
  },
  ui: {
    header: 'Escolha o Serviço',
    sectionTitle: 'Serviços',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Qual serviço você deseja?',
  invalidSelectionMsg: 'Seleção inválida ou expirada. Reenviando a lista.',
  emptyListMessage: 'Nenhum serviço encontrado',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Selecionar este serviço',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)

    await setUserContext(userId, {
      serviceId: item.id,
      serviceName: item.name,
    })

    if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.Appointment) {
      await appointmentService.updateDraftField(userId, AppointmentFields.SERVICE as keyof UpsertAppointmentArgs, { id: item.id, name: item.name })
    }
    await sendWhatsAppMessage(userId, `Serviço '${item.name}' selecionado.`)
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    const updates: Partial<UpsertAppointmentArgs> = {
      service: { id: item.id, name: item.name },
    }

    await appointmentService.updateDraft(userId, updates)
    await sendWhatsAppMessage(userId, `Serviço alterado para '${item.name}'.`)
  },
})

export async function sendServiceSelectionList(userId: string, bodyMsg = 'Qual serviço você deseja?', offset = 0) {
  await serviceFlow.sendList(userId, bodyMsg, offset)
}
