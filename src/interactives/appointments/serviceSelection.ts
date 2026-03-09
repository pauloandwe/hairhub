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
import { appointmentFunctions } from '../../functions/appointments/appointment.functions'
import { getSelectionAck } from '../../utils/conversation-copy'

export const SERVICE_NAMESPACE = 'SERVICE_GROUP'

const serviceFlow = createSelectionFlow<SelectionItem>({
  namespace: SERVICE_NAMESPACE,
  type: 'selectService',
  fetchItems: async (phone) => {
    return serviceService.getServices(phone)
  },
  ui: {
    header: 'Escolha o servico',
    sectionTitle: 'Serviços',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Qual servico voce quer marcar?',
  invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
  emptyListMessage: 'Nao encontrei servicos disponiveis por aqui.',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Escolher esse servico',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)

    await setUserContext(userId, {
      serviceId: item.id,
      serviceName: item.name,
    })

    if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.Appointment) {
      await appointmentService.updateDraftField(userId, AppointmentFields.SERVICE as keyof UpsertAppointmentArgs, { id: item.id, name: item.name, duration: item.duration })
    }
    await sendWhatsAppMessage(userId, getSelectionAck('service', item.name))
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    await setUserContext(userId, {
      serviceId: item.id,
      serviceName: item.name,
    })

    await appointmentFunctions.applyAppointmentRecordUpdates({
      phone: userId,
      updates: { service: { id: item.id, name: item.name, duration: item.duration } } as Partial<UpsertAppointmentArgs>,
      logContext: `Serviço atualizado para ${item.name}`,
    })
  },
})

export async function sendServiceSelectionList(userId: string, bodyMsg = 'Qual servico voce quer marcar?', offset = 0) {
  await serviceFlow.sendList(userId, bodyMsg, offset)
}
