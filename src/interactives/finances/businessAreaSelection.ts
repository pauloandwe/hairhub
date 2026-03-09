import { sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { SimplifiedExpenseField } from '../../enums/cruds/simplifiedExpenseFields.enums'
import { getUserContext, setUserContext, getUserContextSync } from '../../env.config'
import { simplifiedExpenseService } from '../../services/finances/simplifiedExpense/simplifiedExpenseService'
import { UpsertSimplifiedExpenseArgs } from '../../services/finances/simplifiedExpense/simplified-expense.types'
import { simplifiedExpenseFunctions } from '../../functions/finances/simplifiedExpense/simplifiedExpense.functions'
import { SelectionItem } from '../../services/generic/generic.types'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'
import { getSelectionAck } from '../../utils/conversation-copy'

export const BUSINESS_AREA_NAMESPACE = 'BUSINESS_AREA_SELECTION'

const businessAreaFlow = createSelectionFlow<SelectionItem>({
  namespace: BUSINESS_AREA_NAMESPACE,
  type: 'selectBusinessArea',
  fetchItems: async (userId) => {
    return simplifiedExpenseService.listBusinessAreas(userId)
  },
  ui: {
    header: 'Escolha a area de negocio',
    sectionTitle: 'Área de Negócio',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Qual area de negocio voce quer usar?',
  invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
  emptyListMessage: 'Nao encontrei areas de negocio por aqui.',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Escolher essa area de negocio',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)

    await setUserContext(userId, {
      businessAreaId: item.id,
      businessAreaName: item.name,
    })

    if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.SimplifiedExpense) {
      await simplifiedExpenseService.updateDraftField(userId, SimplifiedExpenseField.BusinessArea, { id: item.id, name: item.name })
    }
    await sendWhatsAppMessage(userId, getSelectionAck('generic', item.name))
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    const updates: Partial<UpsertSimplifiedExpenseArgs> = {
      [SimplifiedExpenseField.BusinessArea]: { id: item.id, name: item.name },
    }

    await simplifiedExpenseFunctions.applyExpenseRecordUpdates({
      phone: userId,
      updates,
      logContext: `Área de negócio atualizada para ${item.name}`,
    })
  },
})

export async function sendBusinessAreaSelectionList(userId: string, bodyMsg = 'Qual area de negocio voce quer usar?', offset = 0) {
  await businessAreaFlow.sendList(userId, bodyMsg, offset)
}
