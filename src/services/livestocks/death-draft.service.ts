import { DeathField } from '../../enums/cruds/deathFields.enums'
import { GenericService } from '../generic/generic.service'
import { IBaseEntity, SelectionItem, SummarySections } from '../generic/generic.types'
import { MissingRule } from '../drafts/draft-flow.utils'
import { mergeIdNameRef } from '../drafts/ref.utils'
import { ChatMessage, IdNameRef, PartialIdNameRef } from '../drafts/types'
import { DateFormatter } from '../../utils/date'

export interface DeathValidationDraft {
  quantity: number | null
  observation: string | null
  deathDate: string | null
  harvestConfiguration: IdNameRef
  age: IdNameRef
  category: IdNameRef
  deathCause: IdNameRef
  animalLot: IdNameRef
  retreat: IdNameRef
  area: IdNameRef
  status?: 'collecting' | 'awaiting_confirmation' | 'completed'
  recordId?: string
}

export interface DeathCreationPayload {
  farmId: number
  quantity: number
  observation: string | null
  deathDate: string | null
  harvestConfigurationId: string | null
  ageId: string
  categoryId: string
  deathCauseId: string
  animalLotId?: string | null
  retreatId: string
  areaId: string
  dateFrequencyId?: number
}

export interface DeathRecord extends DeathCreationPayload, IBaseEntity {}

export type DeathFields = `${DeathField.Quantity}` | `${DeathField.Age}` | `${DeathField.Category}` | `${DeathField.DeathCause}` | `${DeathField.Retreat}` | `${DeathField.Area}`

export interface UpsertArgs {
  quantity?: number | null
  observation?: string | null
  deathDate?: string | null
  harvestConfiguration?: PartialIdNameRef | string | null
  age?: PartialIdNameRef | string | null
  category?: PartialIdNameRef | string | null
  deathCause?: PartialIdNameRef | string | null
  animalLot?: PartialIdNameRef | string | null
  retreat?: PartialIdNameRef | string | null
  area?: PartialIdNameRef | string | null
}

const VALID_EDITABLE_FIELDS: (keyof UpsertArgs)[] = [DeathField.Quantity, DeathField.Observation, DeathField.DeathDate, DeathField.HarvestConfiguration, DeathField.Age, DeathField.Category, DeathField.DeathCause, DeathField.AnimalLot, DeathField.Retreat, DeathField.Area]

function emptyDeathDraft(): DeathValidationDraft {
  return {
    quantity: null,
    observation: null,
    deathDate: null,
    harvestConfiguration: { id: null, name: null },
    age: { id: null, name: null },
    category: { id: null, name: null },
    deathCause: { id: null, name: null },
    animalLot: { id: null, name: null },
    retreat: { id: null, name: null },
    area: { id: null, name: null },
    status: 'collecting',
    recordId: undefined,
  }
}

export class DeathDraftService extends GenericService<DeathValidationDraft, DeathCreationPayload, DeathRecord, UpsertArgs> {
  constructor() {
    super('death', emptyDeathDraft, process.env.LIVESTOCKS_URL || '', '/deaths/validate', VALID_EDITABLE_FIELDS, {
      endpoints: {
        autoComplete: ({ farmId }) => (farmId ? `/${farmId}/deaths/validate` : '/deaths/validate'),
        create: ({ farmId }) => (farmId ? `/${farmId}/deaths` : '/deaths'),
        update: ({ farmId }) => (farmId ? `/${farmId}/deaths` : '/deaths'),
        patch: ({ farmId }) => (farmId ? `/${farmId}/deaths` : '/deaths'),
        delete: ({ farmId }) => (farmId ? `/${farmId}/deaths` : '/deaths'),
      },
    })
  }

  protected validateDraftArgsTypes = (args: Partial<UpsertArgs>, currentDraft: DeathValidationDraft): void => {
    if (args.quantity !== undefined) {
      if (args.quantity === null) {
        currentDraft.quantity = null
      } else {
        const numValue = typeof args.quantity === 'number' ? args.quantity : Number(args.quantity)
        currentDraft.quantity = isFinite(numValue) && numValue > 0 ? numValue : currentDraft.quantity
      }
    }

    if (args.observation !== undefined) currentDraft.observation = args.observation ?? null
    if (args.deathDate !== undefined) currentDraft.deathDate = DateFormatter.normalizeToISODate(args.deathDate)

    mergeIdNameRef(currentDraft.harvestConfiguration, args.harvestConfiguration)
    mergeIdNameRef(currentDraft.age, args.age)
    mergeIdNameRef(currentDraft.category, args.category)
    mergeIdNameRef(currentDraft.deathCause, args.deathCause)
    mergeIdNameRef(currentDraft.animalLot, args.animalLot)
    mergeIdNameRef(currentDraft.retreat, args.retreat)
    mergeIdNameRef(currentDraft.area, args.area)

    currentDraft.status = currentDraft.status ?? 'collecting'
  }

  protected override buildAutoCompletePayload(data: DeathValidationDraft, _context: { phone: string; recordId?: string; farmId?: string }): Record<string, unknown> {
    return {
      data: {
        ...data,
      },
    }
  }

  protected getRequiredFields = (): MissingRule<DeathValidationDraft>[] => {
    return [
      { key: DeathField.Quantity, kind: 'number' },
      { key: DeathField.Retreat, kind: 'ref' },
      { key: DeathField.Area, kind: 'ref' },
      { key: DeathField.Age, kind: 'ref' },
      { key: DeathField.Category, kind: 'ref' },
      { key: DeathField.DeathCause, kind: 'ref' },
    ]
  }

  protected getSummarySections = (): SummarySections[] => {
    return [
      {
        label: 'Quantidade',
        value: (draft: DeathValidationDraft) => (draft.quantity == null ? null : `${String(draft.quantity)} animais`),
      },
      {
        label: 'Data da morte',
        value: (draft: DeathValidationDraft) => DateFormatter.formatToBrazilianDate(draft.deathDate),
      },
      {
        label: 'Categoria',
        value: (draft: DeathValidationDraft) => `${draft.category.name} (${draft.age.name})`,
      },
      {
        label: 'Causa da morte',
        value: (draft: DeathValidationDraft) => draft.deathCause.name,
      },
      {
        label: 'Lote Animal',
        value: (draft: DeathValidationDraft) => draft.animalLot.name ?? null,
      },
      {
        label: 'Retiro',
        value: (draft: DeathValidationDraft) => draft.retreat.name ?? null,
      },
      {
        label: 'Área',
        value: (draft: DeathValidationDraft) => draft.area.name ?? null,
      },
      {
        label: 'Safra',
        value: (draft: DeathValidationDraft) => draft.harvestConfiguration.name ?? draft.harvestConfiguration.id ?? '(ATUAL)',
      },
      {
        label: 'Observação',
        value: (draft: DeathValidationDraft) => draft.observation || null,
      },
    ]
  }

  protected transformToApiPayload = (draft: DeathValidationDraft, context: { farmId: number }): DeathCreationPayload => {
    if (!draft.quantity || !draft.age.id || !draft.category.id || !draft.deathCause.id || !draft.retreat.id || !draft.area.id) {
      throw new Error('Rascunho de morte incompleto. Verifique os campos obrigatórios.')
    }
    const { farmId } = context
    if (!farmId) {
      throw new Error('Não foi possível identificar a fazenda para o registro de morte.')
    }
    return {
      farmId,
      quantity: draft.quantity ?? 0,
      observation: draft.observation ?? null,
      deathDate: DateFormatter.normalizeToISODate(draft.deathDate),
      harvestConfigurationId: draft.harvestConfiguration.id ?? null,
      ageId: String(draft.age.id),
      categoryId: String(draft.category.id),
      deathCauseId: String(draft.deathCause.id),
      animalLotId: draft.animalLot.id ?? null,
      retreatId: String(draft.retreat.id),
      areaId: String(draft.area.id),
      dateFrequencyId: 1,
    }
  }

  protected override buildPartialUpdatePayload(draft: DeathValidationDraft, updates: Partial<UpsertArgs>): Partial<DeathCreationPayload> {
    const payload: Partial<DeathCreationPayload> = {}

    const has = (field: keyof UpsertArgs): boolean => Object.prototype.hasOwnProperty.call(updates, field)

    if (has(DeathField.Quantity)) {
      const quantity = Number(draft.quantity ?? 0)
      if (Number.isFinite(quantity) && quantity > 0) {
        payload.quantity = quantity
      }
    }

    if (has(DeathField.Observation)) {
      payload.observation = draft.observation ?? null
    }

    if (has(DeathField.DeathDate)) {
      payload.deathDate = DateFormatter.normalizeToISODate(draft.deathDate)
    }

    if (has(DeathField.HarvestConfiguration)) {
      payload.harvestConfigurationId = draft.harvestConfiguration.id ?? null
    }

    if (has(DeathField.Age) && draft.age.id) {
      payload.ageId = String(draft.age.id)
    }

    if (has(DeathField.Category) && draft.category.id) {
      payload.categoryId = String(draft.category.id)
    }

    if (has(DeathField.DeathCause) && draft.deathCause.id) {
      payload.deathCauseId = String(draft.deathCause.id)
    }

    if (has(DeathField.AnimalLot)) {
      payload.animalLotId = draft.animalLot.id ?? null
    }

    if (has(DeathField.Retreat) && draft.retreat.id) {
      payload.retreatId = String(draft.retreat.id)
    }

    if (has(DeathField.Area) && draft.area.id) {
      payload.areaId = String(draft.area.id)
    }

    return payload
  }

  protected buildListParams = (_listType: string, _context: { phone: string }): Record<string, any> => {
    return {}
  }

  protected extractDataFromResult = (listType: string, result: any): any => {
    if (listType === 'autoComplete') {
      const payload = result?.data?.data
      if (!payload || typeof payload !== 'object') return {}
      const normalizedPayload = { ...payload }
      if (Object.prototype.hasOwnProperty.call(normalizedPayload, DeathField.Quantity)) {
        const rawQuantity = (normalizedPayload as Record<string, unknown>)[DeathField.Quantity]
        const numQuantity = typeof rawQuantity === 'number' ? rawQuantity : Number(rawQuantity)
        if (!Number.isFinite(numQuantity) || numQuantity <= 0) {
          normalizedPayload[DeathField.Quantity] = null
        } else {
          normalizedPayload[DeathField.Quantity] = numQuantity
        }
      }
      return normalizedPayload
    }
    const data = result?.data?.data
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.data)) return data.data
    return []
  }

  protected formatItemToSelection = (_listType: string, item: any): SelectionItem => {
    return {
      id: String(item?.id ?? ''),
      name: String(item?.name ?? item?.description ?? ''),
    }
  }

  protected getListErrorMessage = (): string => {
    return 'Não foi possível carregar a lista solicitada.'
  }

  getValidFieldsFormatted = (): string => {
    const fieldLabels: Partial<Record<keyof UpsertArgs, string>> = {
      quantity: 'quantidade',
      observation: 'observação',
      deathDate: 'data da morte',
      age: 'idade',
      category: 'categoria',
      deathCause: 'causa da morte',
      animalLot: 'lote',
      retreat: 'retiro',
      area: 'área',
      harvestConfiguration: 'configuração de safra',
    }

    return VALID_EDITABLE_FIELDS.map((field) => fieldLabels[field] || field).join(', ')
  }

  async updateWithAgeCategorySelection(
    userId: string,
    params: {
      ageGroupId: string
      ageGroupName: string
      categoryId: string
      categoryName: string
    },
  ): Promise<void> {
    await this.updateDraft(userId, {
      age: { id: params.ageGroupId, name: params.ageGroupName },
      category: { id: params.categoryId, name: params.categoryName },
    })
  }

  async updateWithDeathCause(userId: string, params: { id: string; name: string }): Promise<void> {
    await this.updateDraft(userId, {
      deathCause: { id: params.id, name: params.name },
    })
  }

  async updateWithAnimalLotSelection(
    userId: string,
    params: {
      lotId?: string | null
      lotName?: string | null
      retreatId: string
      retreatName: string
      areaId: string
      areaName: string
    },
  ): Promise<void> {
    await this.updateDraft(userId, {
      animalLot: { id: params.lotId ?? null, name: params.lotName ?? null },
      retreat: { id: params.retreatId, name: params.retreatName },
      area: { id: params.areaId, name: params.areaName },
    })
  }
}

export const deathDraftService = new DeathDraftService()

export const loadDeathDraft = async (userId: string): Promise<DeathValidationDraft> => {
  return deathDraftService.loadDraft(userId)
}

export const saveDeathDraft = async (userId: string, draft: DeathValidationDraft): Promise<void> => {
  await deathDraftService.saveDraft(userId, draft)
}

export const clearDeathDraft = async (userId: string): Promise<void> => {
  await deathDraftService.clearDraft(userId)
}

export const appendDeathDraftHistory = async (userId: string, messages: ChatMessage[]): Promise<void> => {
  await deathDraftService.appendHistoryToDraft(userId, messages)
}

export const removeDeathDraftHistory = async (userId: string, contentToRemove: string): Promise<boolean> => {
  return deathDraftService.removeMessageFromDraftHistory(userId, contentToRemove)
}

export const upsertDeathDraft = async (userId: string, args: UpsertArgs): Promise<DeathValidationDraft> => {
  return deathDraftService.updateDraft(userId, args)
}

export const missingDeathFields = async (draft: DeathValidationDraft): Promise<DeathFields[]> => {
  const missing = await deathDraftService.hasMissingFields(draft)
  return missing as DeathFields[]
}

export const buildCreationPayload = async (draft: DeathValidationDraft, phone: string): Promise<DeathCreationPayload | null> => {
  return deathDraftService.buildCreationPayload({ draft, phone })
}

export const buildSummaryText = async (draft: DeathValidationDraft): Promise<string> => {
  return deathDraftService.buildDraftSummary(draft)
}

export const updateDraftWithAgeCategorySelection = async (
  userId: string,
  params: {
    ageGroupId: string
    ageGroupName: string
    categoryId: string
    categoryName: string
  },
): Promise<void> => {
  await deathDraftService.updateWithAgeCategorySelection(userId, params)
}

export const updateDraftWithDeathCause = async (userId: string, params: { id: string; name: string }): Promise<void> => {
  await deathDraftService.updateWithDeathCause(userId, params)
}

export const updateDraftWithAnimalLotSelection = async (
  userId: string,
  params: {
    lotId?: string | null
    lotName?: string | null
    retreatId: string
    retreatName: string
    areaId: string
    areaName: string
  },
): Promise<void> => {
  await deathDraftService.updateWithAnimalLotSelection(userId, params)
}
