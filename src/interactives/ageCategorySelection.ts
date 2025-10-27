import { sendWhatsAppMessage } from '../api/meta.api'
import { getUserContext, setUserContext, getUserContextSync } from '../env.config'
import { AgeCategoryService, AgeGroup, AgeCategory } from '../services/livestocks/age.service'
import { createTwoStepSelectionFlow } from './flows'
import { updateDraftWithAgeCategorySelection, UpsertArgs } from '../services/livestocks/death-draft.service'
import { tryContinueRegistration } from './followup'
import { CategoryService } from '../services/livestocks/category.service'
import { deathFunctions } from '../functions/livestocks/death/death.functions'
import { DeathField } from '../enums/cruds/deathFields.enums'

export const AGE_GROUP_NAMESPACE = 'AGE_GROUP'
export const AGE_CATEGORY_NAMESPACE = 'AGE_CATEGORY'

const ageCategoryService = new AgeCategoryService()
const categoryService = new CategoryService()

const ageTwoStepFlow = createTwoStepSelectionFlow<AgeGroup, AgeCategory>({
  step1: {
    namespace: AGE_GROUP_NAMESPACE,
    type: 'selectAgeGroup',
    fetchItems: async () => {
      return ageCategoryService.listAgeGroups()
    },
    ui: {
      header: 'Qual o grupo de idade?',
      sectionTitle: 'Grupos',
      footer: 'Inttegra Assistente',
      buttonLabel: 'Ver opções',
    },
    defaultBody: 'Selecione o grupo de idade desejado',
    invalidSelectionMsg: 'Opa, essa opção expirou',
    emptyListMessage: 'Nenhum grupo de idade encontrado',
    titleBuilder: (g, idx, base) => `${base + idx + 1}. ${g.name}`,
    descriptionBuilder: (g) => g.categories?.map((c) => c.name).join(', '),
    onSelected: async ({ userId, item }) => {
      await getUserContext(userId)
      await setUserContext(userId, {
        ageGroupId: item.id,
        ageGroupName: item.name,
        ageCategoryId: '',
        ageCategoryName: '',
      })
    },
  },
  step2: {
    namespace: AGE_CATEGORY_NAMESPACE,
    type: 'selectAgeCategory',
    getParentId: (userId: string) => getUserContextSync(userId)?.ageGroupId,
    fetchItemsByParent: async (_userId, groupId) => {
      return categoryService.listCategoryGroups(groupId)
    },
    ui: {
      header: 'Qual a categoria?',
      sectionTitle: 'Categorias',
      footer: 'Inttegra Assistente',
      buttonLabel: 'Ver opções',
    },
    defaultBody: 'Selecione a categoria desejada',
    invalidSelectionMsg: 'Opa, essa opção expirou',
    emptyListMessage: 'Nenhuma categoria de idade encontrada',
    titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
    descriptionBuilder: () => 'Selecionar esta categoria',
    buildBodyAfterStep1: (selectedGroup) => `Beleza! Grupo '${selectedGroup.name}' já anotado. Agora selecione a categoria`,
    onSelected: async ({ userId, item }) => {
      await getUserContext(userId)
      const ctx = getUserContextSync(userId)

      await setUserContext(userId, {
        ageCategoryId: item.id,
        ageCategoryName: item.name,
      })

      if (getUserContextSync(userId)?.activeRegistration?.type === 'death') {
        await updateDraftWithAgeCategorySelection(userId, {
          ageGroupId: ctx?.ageGroupId,
          ageGroupName: ctx?.ageGroupName,
          categoryId: item.id,
          categoryName: item.name,
        } as any)
      }
      await sendWhatsAppMessage(userId, `Beleza! Categoria '${item.name}' selecionada para o grupo '${ctx?.ageGroupName}'`)
      await tryContinueRegistration(userId)
    },
    onEditModeSelected: async ({ userId, item }) => {
      const ctx = getUserContextSync(userId)
      const updates: Partial<UpsertArgs> = {
        [DeathField.Category]: { id: item.id, name: item.name },
      }
      if (ctx?.ageGroupId && ctx?.ageGroupName) {
        updates[DeathField.Age] = { id: ctx.ageGroupId, name: ctx.ageGroupName }
      }

      await deathFunctions.applyDeathRecordUpdates({
        phone: userId,
        updates,
        logContext: `Categoria atualizada para ${item.name}`,
      })
    },
  },
  pageLimit: 10,
})

export async function sendAgeGroupSelectionList(userId: string, bodyMsg = 'Bora escolher o grupo de idade', offset = 0) {
  await ageTwoStepFlow.sendStep1List(userId, bodyMsg, offset)
}

export async function sendAgeCategorySelectionList(userId: string, groupId: string, bodyMsg = 'Selecione a categoria desejada.', offset = 0) {
  await ageTwoStepFlow.sendStep2List(userId, groupId, bodyMsg, offset)
}
