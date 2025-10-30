import { sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { getUserContext, getUserContextSync, setUserContext } from '../../env.config'
import { purchaseFunctions } from '../../functions/livestocks/purchase/purchase.functions'
import { SelectArrayItem } from '../../helpers/converters/converters.type'
import { purchaseService } from '../../services/livestocks/Purchase/purchaseService'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'

export const PURCHASE_CATEGORY_NAMESPACE = 'PURCHASE_CATEGORY'

const purchaseCategoriesFlow = createSelectionFlow<SelectArrayItem>({
  namespace: PURCHASE_CATEGORY_NAMESPACE,
  type: 'selectPurchaseCategory',
  fetchItems: async () => {
    return purchaseService.listPurchaseCategories()
  },
  ui: {
    header: 'Por favor, selecione a categoria desejada.',
    sectionTitle: 'Categorias',
    footer: 'Inttegra',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Bora selecionar a categoria para essa compra.',
  invalidSelectionMsg: 'Opa, essa opção expirou. Deixe eu enviar de novo pra você.',
  emptyListMessage: 'Nenhuma categoria encontrada',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Selecionar',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)
    const ctx = getUserContextSync(userId)

    await setUserContext(userId, {
      purchaseCategoryId: item.id,
      purchaseCategoryName: item.name,
    })

    await sendWhatsAppMessage(userId, `Beleza! Categoria '${item.name}' já anotada.`)
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

export async function sendPurchaseCategoriesList(userId: string, bodyMsg = 'Antes de continuar, selecione a categoria desejada.', offset = 0) {
  await purchaseCategoriesFlow.sendList(userId, bodyMsg, offset)
}
