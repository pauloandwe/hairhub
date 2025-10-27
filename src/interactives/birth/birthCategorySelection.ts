import { sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { getUserContext, setUserContext, getUserContextSync } from '../../env.config'
import { SelectArrayItem } from '../../helpers/converters/converters.type'
import { birthService } from '../../services/livestocks/Birth/birthService'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'
import { birthFunctions } from '../../functions/livestocks/birth/birth.functions'

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
    footer: 'Inttegra',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Bora selecionar a categoria para esse nascimento.',
  invalidSelectionMsg: 'Opa, essa opção expirou. Deixe eu enviar de novo pra você.',
  emptyListMessage: 'Nenhuma categoria encontrada',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Selecionar',
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
    await sendWhatsAppMessage(userId, `Beleza! Categoria '${item.name}' já anotada.`)
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

export async function sendBirthCategoriesList(userId: string, bodyMsg = 'Antes de continuar, selecione a categoria desejada.', offset = 0) {
  await birthCategoriesFlow.sendList(userId, bodyMsg, offset)
}
