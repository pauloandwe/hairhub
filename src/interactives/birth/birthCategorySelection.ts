import { sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { getUserContext, setUserContext, getUserContextSync } from '../../env.config'
import { SelectArrayItem } from '../../helpers/converters/converters.type'
import { birthService } from '../../services/livestocks/Birth/birthService'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'
import { birthFunctions } from '../../functions/livestocks/birth/birth.functions'
import { getSelectionAck } from '../../utils/conversation-copy'

export const BIRTH_CATEGORY_NAMESPACE = 'BIRTH_CATEGORY'

const birthCategoriesFlow = createSelectionFlow<SelectArrayItem>({
  namespace: BIRTH_CATEGORY_NAMESPACE,
  type: 'selectBirthCategory',
  fetchItems: async () => {
    return birthService.listBirthCategories()
  },
  ui: {
    header: 'Qual categoria de nascimento?',
    sectionTitle: 'Categorias',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Bora selecionar a categoria para esse nascimento.',
  invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
  emptyListMessage: 'Nao encontrei categorias por aqui.',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Escolher',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)
    const ctx = getUserContextSync(userId)

    await setUserContext(userId, {
      birthCategoryId: item.id,
      birthCategoryName: item.name,
    })

    if (ctx?.activeRegistration?.type === FlowType.Birth) {
      await birthService.updateDraftField(userId, 'category', { id: item.id, name: item.name })
    }
    await sendWhatsAppMessage(userId, getSelectionAck('category', item.name))
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    await birthFunctions.applyBirthRecordUpdates({
      phone: userId,
      updates: { category: { id: item.id, name: item.name } },
      logContext: `Categoria atualizada para ${item.name}`,
    })
  },
})

export async function sendBirthCategoriesList(userId: string, bodyMsg = 'Qual categoria voce quer usar?', offset = 0) {
  await birthCategoriesFlow.sendList(userId, bodyMsg, offset)
}
