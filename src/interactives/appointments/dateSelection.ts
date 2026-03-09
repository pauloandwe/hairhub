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

export const DATE_NAMESPACE = 'DATE_GROUP'

const dateSelectionFlow = createSelectionFlow<SelectionItem>({
  namespace: DATE_NAMESPACE,
  type: 'selectDate',
  fetchItems: async (phone) => {
    const draft = await appointmentService.loadDraft(phone)
    const professionalId = draft.professional?.id ? Number(draft.professional.id) : null
    const serviceId = draft.service?.id ? Number(draft.service.id) : null

    if (!serviceId) {
      console.warn('[dateSelectionFlow] Serviço não selecionado para buscar dias disponíveis', { phone })
      await sendWhatsAppMessage(phone, 'Antes me fala qual servico voce quer, ai eu te mostro as datas.')
      return []
    }

    try {
      if (professionalId === null) {
        console.info('[dateSelectionFlow] Buscando dias agregados (profissional não específico)', { phone, serviceId })
        const days = await professionalService.getAvailableDaysAggregated({
          phone,
          serviceId,
        })

        if (!days || days.length === 0) {
          console.warn('[dateSelectionFlow] Nenhum dia disponível encontrado (agregado)', { phone, serviceId })
          await sendWhatsAppMessage(phone, 'Nao achei datas disponiveis para os proximos dias agora. Tenta mais tarde?')
          return []
        }

        return days
      }

      const days = await professionalService.getAvailableDays({
        phone,
        professionalId,
        serviceId,
      })

      if (!days || days.length === 0) {
        console.warn('[dateSelectionFlow] Nenhum dia disponível encontrado', { phone, professionalId, serviceId })
        await sendWhatsAppMessage(phone, 'Nao achei datas livres com esse barbeiro agora. Se quiser, voce pode escolher outro.')
        return []
      }

      return days
    } catch (error) {
      console.error('[dateSelectionFlow] Erro ao buscar dias disponíveis:', error)
      await sendWhatsAppMessage(phone, 'Nao consegui carregar as datas agora. Tenta de novo em instantes?')
      return []
    }
  },
  ui: {
    header: 'Escolha a data',
    sectionTitle: 'Datas Disponíveis',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Qual dia fica melhor pra voce?',
  invalidSelectionMsg: 'Essa data nao esta mais disponivel. Vou te mostrar as opcoes de novo.',
  emptyListMessage: 'Nao encontrei datas disponiveis para os proximos dias.',
  pageLimit: 10,
  titleBuilder: (item, idx, base) => `${base + idx + 1}. ${item.name}${item.description ? ` - ${item.description}` : ''}`,
  descriptionBuilder: () => 'Escolher essa data',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)

    await setUserContext(userId, {
      appointmentDate: item.id,
    })

    if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.Appointment) {
      await appointmentService.updateDraftField(userId, AppointmentFields.APPOINTMENT_DATE as keyof UpsertAppointmentArgs, item.id)
    }
    await sendWhatsAppMessage(userId, getSelectionAck('date', item.name))
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

export async function sendDateSelectionList(userId: string, bodyMsg = 'Qual dia fica melhor pra voce?', offset = 0) {
  await dateSelectionFlow.sendList(userId, bodyMsg, offset)
}
