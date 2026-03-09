import { sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { getUserContext, setUserContext, getUserContextSync } from '../../env.config'
import { SelectArrayItem } from '../../helpers/converters/converters.type'
import { sellingService } from '../../services/livestocks/Selling/sellingService'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'
import { saleFunctions } from '../../functions/livestocks/selling/selling.functions'
import { getSelectionAck } from '../../utils/conversation-copy'

export const SALE_CATEGORY_NAMESPACE = 'SALE_CATEGORY'

const saleCategoriesFlow = createSelectionFlow<SelectArrayItem>({
  namespace: SALE_CATEGORY_NAMESPACE,
  type: 'selectSaleCategory',
  fetchItems: async () => {
    return sellingService.listSaleCategories()
  },
  ui: {
    header: 'Qual categoria do gado?',
    sectionTitle: 'Categorias',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Bora selecionar a categoria para essa venda.',
  invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
  emptyListMessage: 'Nao encontrei categorias por aqui.',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Escolher',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)
    const ctx = getUserContextSync(userId)

    await setUserContext(userId, {
      saleCategoryId: item.id,
      saleCategoryName: item.name,
    })

    if (ctx?.activeRegistration?.type === FlowType.Selling) {
      await sellingService.updateDraftField(userId, 'category', { id: item.id, name: item.name })
    }
    await sendWhatsAppMessage(userId, getSelectionAck('category', item.name))
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    await saleFunctions.applySellingsRecordUpdates({
      phone: userId,
      updates: { category: { id: item.id, name: item.name } },
      logContext: `Categoria atualizada para ${item.name}`,
    })
  },
})

export async function sendSaleCategoriesList(userId: string, bodyMsg = 'Qual categoria voce quer usar?', offset = 0) {
  await saleCategoriesFlow.sendList(userId, bodyMsg, offset)
}
