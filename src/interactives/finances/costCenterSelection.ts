import { sendWhatsAppMessage, sendWhatsAppMessageWithTitle } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { SimplifiedExpenseField } from '../../enums/cruds/simplifiedExpenseFields.enums'
import { getUserContextSync, setUserContext } from '../../env.config'
import { simplifiedExpenseService } from '../../services/finances/simplifiedExpense/simplifiedExpenseService'
import { UpsertSimplifiedExpenseArgs } from '../../services/finances/simplifiedExpense/simplified-expense.types'
import { simplifiedExpenseFunctions } from '../../functions/finances/simplifiedExpense/simplifiedExpense.functions'
import { SelectionItem } from '../../services/generic/generic.types'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'
import { getSelectionAck } from '../../utils/conversation-copy'

const COST_CENTER_SEARCH_ACTION_ID = 'SEARCH_COST_CENTER'

export async function promptCostCenterSearch(userId: string, asAsk?: boolean): Promise<void> {
  const currentContext = getUserContextSync(userId)
  const currentSearchState = currentContext?.costCenterSearch ?? {}

  await setUserContext(userId, {
    costCenterSearch: {
      ...currentSearchState,
      awaitingQuery: true,
    },
  })

  const message = asAsk ? 'Me fala o indice ou o nome do centro de custo que eu busco para voce.' : 'Me manda o indice ou parte do nome do centro de custo.'

  await sendWhatsAppMessageWithTitle(userId, message)
}

export const COST_CENTER_NAMESPACE = 'COST_CENTER_SELECTION'

function formatCostCenterDescription(c: SelectionItem): string {
  if (c.description) return c.description
  if (!c?.index && !c?.name) return 'Escolher esse centro de custo'
  return `${c?.index ? c.index + ' - ' : ''}${c?.name}`
}

const costCenterFlow = createSelectionFlow<SelectionItem>({
  namespace: COST_CENTER_NAMESPACE,
  type: 'selectCostCenter',
  fetchItems: async (phone) => {
    return simplifiedExpenseService.listCostCenters(phone)
  },
  ui: {
    header: 'Escolha o centro de custo',
    sectionTitle: 'Centro de Custo',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Qual centro de custo voce quer usar?',
  invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
  emptyListMessage: 'Nao encontrei centro de custo por aqui.',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: (c) => formatCostCenterDescription(c),
  extraActions: [
    {
      id: COST_CENTER_SEARCH_ACTION_ID,
      title: 'Buscar centro',
      description: 'Procurar por nome ou indice',
      sectionTitle: 'Buscar',
      onSelected: async ({ userId }) => {
        await promptCostCenterSearch(userId)
      },
    },
  ],
  onSelected: async ({ userId, item }) => {
    await setUserContext(userId, {
      costCenterSearch: {
        awaitingQuery: false,
        lastQuery: undefined,
      },
    })

    if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.SimplifiedExpense) {
      await simplifiedExpenseService.updateDraftField(userId, SimplifiedExpenseField.CostCenter, { id: item.id, name: item.name })
    }
    await sendWhatsAppMessage(userId, getSelectionAck('generic', item.name))
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    await setUserContext(userId, {
      costCenterSearch: {
        awaitingQuery: false,
        lastQuery: undefined,
      },
    })

    const updates: Partial<UpsertSimplifiedExpenseArgs> = {
      [SimplifiedExpenseField.CostCenter]: { id: item.id, name: item.name },
    }

    await simplifiedExpenseFunctions.applyExpenseRecordUpdates({
      phone: userId,
      updates,
      logContext: `Centro de custo atualizado para ${item.name}`,
    })
  },
})

export async function sendCostCenterSelectionList(userId: string, bodyMsg = 'Qual centro de custo voce quer usar?', offset = 0, itemsOverride?: SelectionItem[]) {
  await costCenterFlow.sendList(userId, bodyMsg, offset, itemsOverride)
}
