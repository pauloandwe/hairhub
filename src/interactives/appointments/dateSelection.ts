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
import { appointmentFunctions } from '../../functions/appointments/appointment.functions'

export const DATE_NAMESPACE = 'DATE_GROUP'

const dateSelectionFlow = createSelectionFlow<SelectionItem>({
  namespace: DATE_NAMESPACE,
  type: 'selectDate',
  fetchItems: async (phone) => {
    const draft = await appointmentService.loadDraft(phone)
    const barberId = draft.barber?.id ? Number(draft.barber.id) : null
    const serviceId = draft.service?.id ? Number(draft.service.id) : null

    if (!barberId) {
      console.warn('[dateSelectionFlow] Barbeiro não selecionado para buscar dias disponíveis', { phone })
      await sendWhatsAppMessage(phone, 'Ops! Você precisa selecionar um barbeiro antes de escolher a data.')
      return []
    }

    if (!serviceId) {
      console.warn('[dateSelectionFlow] Serviço não selecionado para buscar dias disponíveis', { phone })
      await sendWhatsAppMessage(phone, 'Ops! Você precisa selecionar um serviço antes de escolher a data.')
      return []
    }

    try {
      const days = await barberService.getAvailableDays({
        phone,
        barberId,
        serviceId,
      })

      if (!days || days.length === 0) {
        console.warn('[dateSelectionFlow] Nenhum dia disponível encontrado', { phone, barberId, serviceId })
        await sendWhatsAppMessage(phone, 'Infelizmente não há datas disponíveis para os próximos dias com o barbeiro selecionado. Tente novamente mais tarde ou escolha outro barbeiro.')
        return []
      }

      return days
    } catch (error) {
      console.error('[dateSelectionFlow] Erro ao buscar dias disponíveis:', error)
      await sendWhatsAppMessage(phone, 'Erro ao carregar as datas disponíveis. Tente novamente.')
      return []
    }
  },
  ui: {
    header: 'Escolha a Data',
    sectionTitle: 'Datas Disponíveis',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Qual data você prefere?',
  invalidSelectionMsg: 'Seleção inválida ou expirada. Reenviando a lista.',
  emptyListMessage: 'Nenhuma data disponível para os próximos dias',
  pageLimit: 10,
  titleBuilder: (item, idx, base) => `${base + idx + 1}. ${item.name}${item.description ? ` - ${item.description}` : ''}`,
  descriptionBuilder: () => 'Selecionar esta data',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)

    await setUserContext(userId, {
      appointmentDate: item.id,
    })

    if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.Appointment) {
      await appointmentService.updateDraftField(userId, AppointmentFields.DATE as keyof UpsertAppointmentArgs, item.id)
    }
    await sendWhatsAppMessage(userId, `Data '${item.name}' selecionada.`)
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    await setUserContext(userId, {
      appointmentDate: item.id,
    })

    await appointmentFunctions.applyAppointmentRecordUpdates({
      phone: userId,
      updates: { appointmentDate: item.id } as Partial<UpsertAppointmentArgs>,
      logContext: `Data atualizada para ${item.name}`,
    })
  },
})

export async function sendDateSelectionList(userId: string, bodyMsg = 'Qual data você prefere?', offset = 0) {
  await dateSelectionFlow.sendList(userId, bodyMsg, offset)
}
