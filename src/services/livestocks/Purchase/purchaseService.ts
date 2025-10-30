import { addMinutes, format, isValid, parse, parseISO } from 'date-fns'
import api from '../../../config/api.config'
import { resetActiveRegistration } from '../../../env.config'
import { SelectArrayItem } from '../../../helpers/converters/converters.type'
import { formatCurrency, toIntegerCents } from '../../../utils/numbers'
import { MissingRule } from '../../drafts/draft-flow.utils'
import { emptyPurchaseDraft } from '../../drafts/livestock/purchase/purchase.draft'
import { GenericService } from '../../generic/generic.service'
import { SelectionItem, SummarySections } from '../../generic/generic.types'
import { clearAllUserIntents } from '../../intent-history.service'
import { IPurchaseCreationPayload, IPurchaseValidationDraft, PurchaseField, PurchaseRecord, UpsertPurchaseArgs } from './purchase.types'
import { IdNameRef } from '../../drafts/types'
import { mergeIdNameRef } from '../../drafts/ref.utils'
import { LivestockEntryTypesEnum } from '../../../enums/livestockEntryTypes.enum'

const autoCompleteEndpoint = '/sales/chat-auto-complete'
const VALID_EDITABLE_FIELDS: (keyof UpsertPurchaseArgs)[] = [PurchaseField.SaleDate, PurchaseField.Weight, PurchaseField.Quantity, PurchaseField.UnityValue, PurchaseField.TotalValue, PurchaseField.Category, PurchaseField.Area, PurchaseField.Retreat, PurchaseField.Observation]
export class PurchaseService extends GenericService<IPurchaseValidationDraft, IPurchaseCreationPayload, PurchaseRecord, UpsertPurchaseArgs> {
  constructor() {
    super('sales', emptyPurchaseDraft, process.env.LIVESTOCKS_URL || '', autoCompleteEndpoint, VALID_EDITABLE_FIELDS, {
      endpoints: {
        autoComplete: ({ farmId }) => (farmId ? `/${farmId}/sales/chat-auto-complete` : '/sales/chat-auto-complete'),
        create: ({ farmId }) => (farmId ? `/${farmId}/sales` : '/sales'),
        update: ({ farmId }) => (farmId ? `/${farmId}/sales` : '/sales'),
        patch: ({ farmId }) => (farmId ? `/${farmId}/sales` : '/sales'),
        delete: ({ farmId }) => (farmId ? `/${farmId}/sales` : '/sales'),
      },
    })
  }

  async listPurchaseCategories(): Promise<SelectArrayItem[]> {
    const params = {
      page: 1,
      pageSize: 100,
      advancedFilters: 'active:EQ:true',
    }

    try {
      const response = await api.get(`${process.env.LIVESTOCKS_URL}/categories`, {
        params,
      })

      const categories = response?.data?.data?.data ?? response?.data?.data ?? []
      return (
        categories?.map((category: any) => ({
          id: category.id,
          key: String(category.id),
          name: category.name,
        })) ?? []
      )
    } catch (error) {
      console.error('[PurchaseService] Erro ao listar categorias:', error)
      throw new Error('Erro ao listar categorias de venda.')
    }
  }

  private formatDraftDate = (rawDate?: string | Date | null): string | null => {
    if (!rawDate) return null

    let parsedDate: Date | null = null

    if (rawDate instanceof Date) {
      parsedDate = rawDate
    } else {
      const normalized = `${rawDate}`.trim()
      if (!normalized) return null

      const datePortion = normalized.length >= 10 ? normalized.slice(0, 10) : normalized
      const parsedByPattern = parse(datePortion, 'yyyy-MM-dd', new Date())

      if (isValid(parsedByPattern)) {
        parsedDate = parsedByPattern
      } else {
        const parsedByIso = parseISO(normalized)
        if (isValid(parsedByIso)) {
          parsedDate = addMinutes(parsedByIso, parsedByIso.getTimezoneOffset())
        }
      }
    }

    if (!parsedDate || !isValid(parsedDate)) return null

    return format(parsedDate, 'dd/MM/yyyy')
  }

  protected validateDraftArgsTypes = (args: Partial<UpsertPurchaseArgs>, currentDraft: IPurchaseValidationDraft): void => {
    if (args.saleDate) {
      const rawSaleDate = String(args.saleDate).trim()
      if (rawSaleDate) {
        let parsedDate = parseISO(rawSaleDate)

        if (!isValid(parsedDate)) {
          const datePortion = rawSaleDate.length >= 10 ? rawSaleDate.slice(0, 10) : rawSaleDate
          parsedDate = parse(datePortion, 'dd/MM/yyyy', new Date())
        }

        if (isValid(parsedDate)) {
          currentDraft.saleDate = format(parsedDate, 'yyyy-MM-dd')
        }
      }
    }

    if (args.weight !== undefined && args.weight !== null) {
      const parsedWeight = Number(args.weight)
      if (Number.isFinite(parsedWeight) && parsedWeight > 0) {
        currentDraft.weight = parsedWeight
      }
    }

    if (args.quantity !== undefined && args.quantity !== null) {
      const parsedQuantity = Number(args.quantity)
      if (Number.isFinite(parsedQuantity) && parsedQuantity > 0) {
        currentDraft.quantity = parsedQuantity
      }
    }

    if (args.unityValue !== undefined && args.unityValue !== null) {
      const parsedValue = Number(args.unityValue)
      if (Number.isFinite(parsedValue) && parsedValue > 0) {
        currentDraft.unityValue = parsedValue
      }
    }

    if (args.totalValue !== undefined && args.totalValue !== null) {
      const parsedValue = Number(args.totalValue)
      if (Number.isFinite(parsedValue) && parsedValue > 0) {
        currentDraft.totalValue = parsedValue
      }
    }

    if (args.observation !== undefined && args.observation !== null) {
      currentDraft.observation = String(args.observation).trim()
    }

    const assignRef = (field: keyof Pick<IPurchaseValidationDraft, 'category' | 'retreat' | 'area' | 'harvestConfiguration'>, incoming: IdNameRef | null | undefined) => {
      if (incoming === undefined) return
      if (incoming === null) {
        currentDraft[field] = null
        return
      }

      const target = currentDraft[field]
      if (!target) {
        currentDraft[field] = { id: incoming.id ?? null, name: incoming.name ?? null }
        return
      }

      mergeIdNameRef(target, incoming)
    }

    if (args.category) assignRef('category', args.category as IdNameRef | null | undefined)
    if (args.retreat) assignRef('retreat', args.retreat as IdNameRef | null | undefined)
    if (args.area) assignRef('area', args.area as IdNameRef | null | undefined)
    if (args.harvestConfiguration) assignRef('harvestConfiguration', args.harvestConfiguration as IdNameRef | null | undefined)
  }

  protected getRequiredFields = (): MissingRule<IPurchaseValidationDraft>[] => {
    return [
      { key: PurchaseField.SaleDate, kind: 'string' },
      { key: PurchaseField.Weight, kind: 'number' },
      { key: PurchaseField.Quantity, kind: 'number' },
      { key: PurchaseField.UnityValue, kind: 'number' },
      { key: PurchaseField.TotalValue, kind: 'number' },
      { key: PurchaseField.Category, kind: 'ref' },
      { key: PurchaseField.Area, kind: 'ref' },
      { key: PurchaseField.Retreat, kind: 'ref' },
    ]
  }

  protected getSummarySections = (): SummarySections[] => {
    return [
      {
        label: 'Data da compra',
        value: (draft: IPurchaseValidationDraft) => this.formatDraftDate(draft.saleDate),
      },
      {
        label: 'Peso',
        value: (draft: IPurchaseValidationDraft) => draft.weight ?? null,
      },
      {
        label: 'Quantidade',
        value: (draft: IPurchaseValidationDraft) => draft.quantity,
      },
      {
        label: 'Valor unitário',
        value: (draft: IPurchaseValidationDraft) => formatCurrency(draft.unityValue),
      },
      {
        label: 'Categoria',
        value: (draft: IPurchaseValidationDraft) => {
          return draft.category?.name ?? null
        },
      },
      {
        label: 'Área',
        value: (draft: IPurchaseValidationDraft) => {
          return draft.area?.name ?? null
        },
      },
      {
        label: 'Retiro',
        value: (draft: IPurchaseValidationDraft) => draft.retreat?.name ?? null,
      },
    ]
  }

  protected transformToApiPayload = (draft: IPurchaseValidationDraft, context: { farmId: number }): IPurchaseCreationPayload => {
    const finalPayload: IPurchaseCreationPayload = {
      saleDate: draft.saleDate as string,
      weight: toIntegerCents(draft.weight) ?? 0,
      quantity: Number(draft.quantity ?? 0),
      unityValue: toIntegerCents(draft.unityValue) ?? 0,
      totalValue: toIntegerCents(draft.totalValue) ?? 0,
      saleTypeId: LivestockEntryTypesEnum.PURCHASE,
      dateFrequencyId: 1,
      observation: draft.observation ?? 'Lançamento realizado via Assistente Inttegra',
      isExternalOrigin: false,
      harvestConfigurationId: Number(draft.harvestConfiguration?.id) ?? null,
      categoryId: Number(draft.category?.id),
      farmId: context.farmId,
      retreatId: Number(draft.retreat?.id),
      areaId: Number(draft.area?.id),
    }

    return finalPayload
  }

  protected buildListParams = (listType: string, context: { phone: string }): Record<string, any> => {
    switch (listType) {
      case PurchaseField.Category:
        return {
          advancedFilters: 'isCategory:IN:true',
        }
      case PurchaseField.Area:
        return {
          advancedFilters: 'isArea:IN:true',
        }
      case PurchaseField.Retreat:
        return {
          advancedFilters: 'isRetreat:IN:true',
        }
      default:
        return {}
    }
  }

  protected extractDataFromResult = (listType: string, result: any): any => {
    if (listType === 'autoComplete') {
      return result?.data?.data ?? {}
    }
    const data = result?.data?.data
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.data)) return data.data
    return []
  }

  protected formatItemToSelection = (listType: string, item: any): SelectionItem => {
    switch (listType) {
      case PurchaseField.Category:
        return {
          id: item.id,
          name: item.name,
        }
      case PurchaseField.Area:
      case PurchaseField.Retreat:
        return {
          id: item.id,
          name: item.description,
        }
      default:
        return { id: '', name: '' }
    }
  }

  protected getListErrorMessage = (listType: string): string => {
    switch (listType) {
      case PurchaseField.Category:
        return 'Erro ao listar categorias de venda.'
      case PurchaseField.Area:
      case PurchaseField.Retreat:
        return 'Erro ao listar áreas.'
      default:
        return 'Não foi possível carregar a lista solicitada.'
    }
  }

  protected override buildPartialUpdatePayload(draft: IPurchaseValidationDraft, updates: Partial<UpsertPurchaseArgs>): Partial<IPurchaseCreationPayload> {
    const payload: Partial<IPurchaseCreationPayload> = {}
    const has = (field: keyof UpsertPurchaseArgs): boolean => Object.prototype.hasOwnProperty.call(updates, field)

    const invalidFields = Object.keys(updates).filter((field) => !this.isFieldValid(field))
    if (invalidFields.length > 0) {
      console.warn(`[PurchaseService] Invalid fields for update ignored: ${invalidFields.join(', ')}`)
    }

    if (has(PurchaseField.SaleDate)) {
      payload.saleDate = draft.saleDate ?? undefined
    }

    if (has(PurchaseField.Weight)) {
      const weight = Number(draft.weight ?? 0)
      if (Number.isFinite(weight) && weight > 0) {
        payload.weight = weight
      }
    }

    if (has(PurchaseField.Quantity)) {
      const quantity = Number(draft.quantity ?? 0)
      if (Number.isFinite(quantity) && quantity > 0) {
        payload.quantity = quantity
      }
    }

    if (has(PurchaseField.UnityValue)) {
      const value = Number(draft.unityValue ?? 0)
      if (Number.isFinite(value) && value > 0) {
        payload.unityValue = value
      }
    }

    if (has(PurchaseField.TotalValue)) {
      const value = Number(draft.totalValue ?? 0)
      if (Number.isFinite(value) && value > 0) {
        payload.totalValue = value
      }
    }

    if (has(PurchaseField.Observation)) {
      payload.observation = draft.observation ?? undefined
    }

    if (has(PurchaseField.Category)) {
      const categoryId = Number(draft.category?.id)
      if (Number.isFinite(categoryId) && categoryId > 0) {
        payload.categoryId = categoryId
      }
    }

    if (has(PurchaseField.Retreat)) {
      const retreatId = Number(draft.retreat?.id)
      if (Number.isFinite(retreatId) && retreatId > 0) {
        payload.retreatId = retreatId
      }
    }

    if (has(PurchaseField.Area)) {
      const areaId = Number(draft.area?.id)
      if (Number.isFinite(areaId) && areaId > 0) {
        payload.areaId = areaId
      }
    }
    return payload
  }

  create = async (phone: string, draft: IPurchaseValidationDraft): Promise<{ id: string }> => {
    const endpoint = `/1/sales`
    try {
      const result = await this._createRecord(phone, draft, endpoint)
      return result
    } catch (error) {
      console.error('[PurchaseService] Erro ao criar registro de compra:', error)
      resetActiveRegistration(phone)
      await clearAllUserIntents(phone)
      await purchaseService.clearDraft(phone)
      throw error
    }
  }

  getValidFieldsFormatted = (): string => {
    const fieldLabels: Partial<Record<keyof UpsertPurchaseArgs, string>> = {
      saleDate: 'data de compra',
      weight: 'peso',
      quantity: 'quantidade',
      unityValue: 'valor unitário',
      totalValue: 'valor total',
      observation: 'observação',
      category: 'categoria',
      area: 'área',
      retreat: 'retiro',
    }

    return VALID_EDITABLE_FIELDS.map((field) => fieldLabels[field] || field).join(', ')
  }
}

export const purchaseService = new PurchaseService()
