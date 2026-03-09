import { sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { getUserContext, getUserContextSync, setUserContext } from '../../env.config'
import { purchaseFunctions } from '../../functions/livestocks/purchase/purchase.functions'
import { SelectArrayItem } from '../../helpers/converters/converters.type'
import { purchaseService } from '../../services/livestocks/Purchase/purchaseService'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'
import { getSelectionAck } from '../../utils/conversation-copy'

export const PURCHASE_CATEGORY_NAMESPACE = 'PURCHASE_CATEGORY'

const purchaseCategoriesFlow = createSelectionFlow<SelectArrayItem>({
  namespace: PURCHASE_CATEGORY_NAMESPACE,
  type: 'selectPurchaseCategory',
  fetchItems: async () => {
    return purchaseService.listPurchaseCategories()
  },
  ui: {
    header: 'Escolha a categoria',
    sectionTitle: 'Categorias',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Bora selecionar a categoria para essa compra.',
  invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
  emptyListMessage: 'Nao encontrei categorias por aqui.',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Escolher',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)
    const ctx = getUserContextSync(userId)

    await setUserContext(userId, {
      purchaseCategoryId: item.id,
      purchaseCategoryName: item.name,
    })

    await sendWhatsAppMessage(userId, getSelectionAck('category', item.name))
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    await purchaseFunctions.applyPurchaseRecordUpdates({
      phone: userId,
      updates: { category: { id: item.id, name: item.name } },
      logContext: `Categoria atualizada para ${item.name}`,
    })
  },
})

export async function sendPurchaseCategoriesList(userId: string, bodyMsg = 'Qual categoria voce quer usar?', offset = 0) {
  await purchaseCategoriesFlow.sendList(userId, bodyMsg, offset)
}
