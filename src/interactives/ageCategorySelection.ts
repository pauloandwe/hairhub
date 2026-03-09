import { sendWhatsAppMessage } from '../api/meta.api'
import { FlowType } from '../enums/generic.enum'
import { getUserContext, getUserContextSync, setUserContext } from '../env.config'
import { deathFunctions } from '../functions/livestocks/death/death.functions'
import { DeathField } from '../enums/cruds/deathFields.enums'
import { updateDraftWithAgeCategorySelection, UpsertArgs as DeathUpsertArgs } from '../services/livestocks/death-draft.service'
import { AgeCategoryService, AgeGroup, AgeCategory } from '../services/livestocks/age.service'
import { CategoryService } from '../services/livestocks/category.service'
import { tryContinueRegistration } from './followup'
import { createTwoStepSelectionFlow } from './flows'
import { getSelectionAck } from '../utils/conversation-copy'

export const AGE_GROUP_NAMESPACE = 'AGE_GROUP'
export const AGE_CATEGORY_NAMESPACE = 'AGE_CATEGORY'

type AgeGroupSnapshot = { id?: string | null; name?: string | null }

interface AgeCategorySelectionMessages {
  groupPrompt?: string
  categoryPrompt?: string
  success?: (params: { groupName?: string | null; categoryName: string }) => string
}

interface AgeCategorySelectionConfig {
  namespaces: { group: string; category: string }
  flowType: FlowType
  messages?: AgeCategorySelectionMessages
  applySelection?: (args: { userId: string; group: AgeGroupSnapshot; category: AgeCategory }) => Promise<void>
  applyEditSelection?: (args: { userId: string; group: AgeGroupSnapshot; category: AgeCategory }) => Promise<void>
}

interface AgeCategorySelectors {
  sendGroupList: (userId: string, bodyMsg?: string, offset?: number) => Promise<void>
  sendCategoryList: (userId: string, groupId: string, bodyMsg?: string, offset?: number) => Promise<void>
}

const DEFAULT_GROUP_PROMPT = 'Qual grupo de idade faz sentido aqui?'
const DEFAULT_CATEGORY_PROMPT = 'Agora me diz qual categoria.'

const ageCategoryService = new AgeCategoryService()
const categoryService = new CategoryService()

export const buildAgeCategorySelection = (config: AgeCategorySelectionConfig): AgeCategorySelectors => {
  const groupPrompt = config.messages?.groupPrompt ?? DEFAULT_GROUP_PROMPT
  const categoryPrompt = config.messages?.categoryPrompt ?? DEFAULT_CATEGORY_PROMPT

  const twoStepFlow = createTwoStepSelectionFlow<AgeGroup, AgeCategory>({
    step1: {
      namespace: config.namespaces.group,
      type: 'selectAgeGroup',
      fetchItems: async () => {
        return ageCategoryService.listAgeGroups()
      },
      ui: {
        header: 'Qual o grupo de idade?',
        sectionTitle: 'Grupos',
        buttonLabel: 'Ver opções',
      },
      defaultBody: groupPrompt,
      invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
      emptyListMessage: 'Nao encontrei grupos de idade por aqui.',
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
      namespace: config.namespaces.category,
      type: 'selectAgeCategory',
      getParentId: (userId: string) => getUserContextSync(userId)?.ageGroupId,
      fetchItemsByParent: async (_userId, groupId) => {
        return categoryService.listCategoryGroups(groupId)
      },
      ui: {
        header: 'Qual a categoria?',
        sectionTitle: 'Categorias',
        buttonLabel: 'Ver opções',
      },
      defaultBody: categoryPrompt,
      invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
      emptyListMessage: 'Nao encontrei categorias por aqui.',
      titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
      descriptionBuilder: () => 'Escolher essa categoria',
      buildBodyAfterStep1: (selectedGroup) => `Perfeito, anotei o grupo ${selectedGroup.name}. Agora me diz a categoria.`,
      onSelected: async ({ userId, item }) => {
        await getUserContext(userId)
        const ctx = getUserContextSync(userId)

        await setUserContext(userId, {
          ageCategoryId: item.id,
          ageCategoryName: item.name,
        })

        const activeFlow = ctx?.activeRegistration?.type
        const groupSnapshot: AgeGroupSnapshot = {
          id: ctx?.ageGroupId,
          name: ctx?.ageGroupName,
        }

        if (activeFlow === config.flowType && config.applySelection) {
          try {
            await config.applySelection({ userId, group: groupSnapshot, category: item })
          } catch (error) {
            console.error(`[AgeCategorySelection:${config.flowType}] Falha ao aplicar seleção`, error)
          }
        }

        const successMessage = config.messages?.success?.({ groupName: groupSnapshot.name, categoryName: item.name }) ?? getSelectionAck('category', item.name)
        await sendWhatsAppMessage(userId, successMessage)

        if (activeFlow === config.flowType) {
          await tryContinueRegistration(userId)
        }
      },
      onEditModeSelected: async ({ userId, item }) => {
        if (!config.applyEditSelection) return
        const ctx = getUserContextSync(userId)
        const groupSnapshot: AgeGroupSnapshot = {
          id: ctx?.ageGroupId,
          name: ctx?.ageGroupName,
        }
        await config.applyEditSelection({ userId, group: groupSnapshot, category: item })
      },
    },
    pageLimit: 10,
  })

  return {
    sendGroupList: async (userId, bodyMsg = groupPrompt, offset = 0) => {
      await twoStepFlow.sendStep1List(userId, bodyMsg, offset)
    },
    sendCategoryList: async (userId, groupId, bodyMsg = categoryPrompt, offset = 0) => {
      await twoStepFlow.sendStep2List(userId, groupId, bodyMsg, offset)
    },
  }
}

const deathAgeCategorySelector = buildAgeCategorySelection({
  namespaces: { group: AGE_GROUP_NAMESPACE, category: AGE_CATEGORY_NAMESPACE },
  flowType: FlowType.Death,
  messages: {
    groupPrompt: 'Qual grupo de idade faz sentido aqui?',
    categoryPrompt: 'Agora me diz qual categoria.',
    success: ({ groupName, categoryName }) => (groupName ? `Perfeito, fiquei com ${categoryName} no grupo ${groupName}.` : getSelectionAck('category', categoryName)),
  },
  applySelection: async ({ userId, group, category }) => {
    await updateDraftWithAgeCategorySelection(userId, {
      ageGroupId: group.id,
      ageGroupName: group.name,
      categoryId: category.id,
      categoryName: category.name,
    } as any)
  },
  applyEditSelection: async ({ userId, group, category }) => {
    const updates: Partial<DeathUpsertArgs> = {
      [DeathField.Category]: { id: category.id, name: category.name },
    }

    if (group.id && group.name) {
      updates[DeathField.Age] = { id: group.id, name: group.name }
    }

    await deathFunctions.applyDeathRecordUpdates({
      phone: userId,
      updates,
      logContext: `Categoria atualizada para ${category.name}`,
    })
  },
})

export async function sendAgeGroupSelectionList(userId: string, bodyMsg = 'Qual grupo de idade faz sentido aqui?', offset = 0) {
  await deathAgeCategorySelector.sendGroupList(userId, bodyMsg, offset)
}

export async function sendAgeCategorySelectionList(userId: string, groupId: string, bodyMsg = 'Agora me diz qual categoria.', offset = 0) {
  await deathAgeCategorySelector.sendCategoryList(userId, groupId, bodyMsg, offset)
}
