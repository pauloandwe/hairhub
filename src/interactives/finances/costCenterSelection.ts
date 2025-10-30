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

  const message = asAsk ? 'Voce precisa selecionar em centro de custo. Me falo o índice ou o nome do centro de custo para mim buscar.' : 'Digite o índice ou parte do nome do centro de custo que deseja buscar.'

  await sendWhatsAppMessageWithTitle(userId, message)
}

export const COST_CENTER_NAMESPACE = 'COST_CENTER_SELECTION'

function formatCostCenterDescription(c: SelectionItem): string {
  if (c.description) return c.description
  if (!c?.index && !c?.name) return 'Selecionar este centro de custo'
  return `${c?.index ? c.index + ' - ' : ''}${c?.name}`
}

const costCenterFlow = createSelectionFlow<SelectionItem>({
  namespace: COST_CENTER_NAMESPACE,
  type: 'selectCostCenter',
  fetchItems: async (phone) => {
    return simplifiedExpenseService.listCostCenters(phone)
  },
  ui: {
    header: 'Escolha o Centro de Custo',
    sectionTitle: 'Centro de Custo',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Selecione o centro de custo desejado.',
  invalidSelectionMsg: 'Seleção inválida ou expirada. Reenviando a lista.',
  emptyListMessage: 'Nenhum centro de custo encontrado',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: (c) => formatCostCenterDescription(c),
  extraActions: [
    {
      id: COST_CENTER_SEARCH_ACTION_ID,
      title: 'Pesquisar Centro de Custos',
      description: 'Buscar por nome ou índice específico',
      sectionTitle: 'Pesquisar Centros',
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
    await sendWhatsAppMessage(userId, `Centro de custo '${item.name}' selecionado.`)
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

export async function sendCostCenterSelectionList(userId: string, bodyMsg = 'Selecione o centro de custo.', offset = 0, itemsOverride?: SelectionItem[]) {
  await costCenterFlow.sendList(userId, bodyMsg, offset, itemsOverride)
}
