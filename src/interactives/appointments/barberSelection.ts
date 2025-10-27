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

export const BARBER_NAMESPACE = 'BARBER_GROUP'

const barberFlow = createSelectionFlow<SelectionItem>({
  namespace: BARBER_NAMESPACE,
  type: 'selectBarber',
  fetchItems: async (phone) => {
    return barberService.getBarbers(phone)
  },
  ui: {
    header: 'Escolha o Barbeiro',
    sectionTitle: 'Barbeiros',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Qual barbeiro você prefere?',
  invalidSelectionMsg: 'Seleção inválida ou expirada. Reenviando a lista.',
  emptyListMessage: 'Nenhum barbeiro encontrado',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Selecionar este barbeiro',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)

    await setUserContext(userId, {
      barberId: item.id,
      barberName: item.name,
    })

    if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.Appointment) {
      await appointmentService.updateDraftField(userId, AppointmentFields.BARBER as keyof UpsertAppointmentArgs, { id: item.id, name: item.name })
    }
    await sendWhatsAppMessage(userId, `Barbeiro '${item.name}' selecionado.`)
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    const updates: Partial<UpsertAppointmentArgs> = {
      barber: { id: item.id, name: item.name },
    }

    await appointmentService.updateDraft(userId, updates)
    await sendWhatsAppMessage(userId, `Barbeiro alterado para '${item.name}'.`)
  },
})

export async function sendBarberSelectionList(userId: string, bodyMsg = 'Qual barbeiro você prefere?', offset = 0) {
  await barberFlow.sendList(userId, bodyMsg, offset)
}
