import { addMinutes, format, isValid, parse, parseISO } from 'date-fns'
import api from '../../../config/api.config'
import { SellingField } from '../../../enums/cruds/sellingFields.enum'
import { SellingTypesEnum, SellingTypesLabels } from '../../../enums/sellingTypes.enum'
import { emptySaleDraft } from '../../drafts/livestock/selling/selling.draft'
import { GenericService } from '../../generic/generic.service'
import { SellingsRecord, ISellingsCreationPayload, ISellingsValidationDraft, UpsertSellingsArgs } from './selling.types'
import { MissingRule } from '../../drafts/draft-flow.utils'
import { SelectionItem, SummarySections } from '../../generic/generic.types'
import { resetActiveRegistration } from '../../../env.config'
import { SelectArrayItem } from '../../../helpers/converters/converters.type'
import { mergeIdNameRef } from '../../drafts/ref.utils'
import { IdNameRef } from '../../drafts/types'
import { clearAllUserIntents } from '../../intent-history.service'
import { formatCurrency, parseLocalizedNumber, parsePositiveInteger, toIntegerCents } from '../../../utils/numbers'

const VALID_EDITABLE_FIELDS: (keyof UpsertSellingsArgs)[] = [
  SellingField.SaleType,
  SellingField.SaleDate,
  SellingField.AliveWeight,
  SellingField.DeadWeight,
  SellingField.Quantity,
  SellingField.UnityValue,
  SellingField.ArrobaCost,
  SellingField.CarcassYield,
  SellingField.Category,
  SellingField.Area,
  SellingField.Retreat,
  SellingField.Observation,
  SellingField.DestinationFarm,
  SellingField.DestinationRetreat,
  SellingField.DestinationArea,
  SellingField.IsExternalDestination,
  SellingField.Age,
  SellingField.AnimalLotId,
  SellingField.FatteningSystemId,
  SellingField.HarvestConfiguration,
]

export class SellingService extends GenericService<ISellingsValidationDraft, ISellingsCreationPayload, SellingsRecord, UpsertSellingsArgs> {
  constructor() {
    super('selling', emptySaleDraft, process.env.LIVESTOCKS_URL || '', '/sellings/chat-auto-complete', VALID_EDITABLE_FIELDS, {
      endpoints: {
        autoComplete: ({ farmId }) => (farmId ? `/${farmId}/sellings/chat-auto-complete` : '/sellings/chat-auto-complete'),
        create: ({ farmId }) => (farmId ? `/${farmId}/sellings` : '/sellings'),
        update: ({ farmId }) => (farmId ? `/${farmId}/sellings` : '/sellings'),
        patch: ({ farmId }) => (farmId ? `/${farmId}/sellings` : '/sellings'),
        delete: ({ farmId }) => (farmId ? `/${farmId}/sellings` : '/sellings'),
      },
    })
  }

  async listSaleCategories(): Promise<SelectArrayItem[]> {
    const params = {
      page: 1,
      pageSize: 100,
      includes: 'gender,categoryType',
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
      console.error('[SellingService] Erro ao listar categorias:', error)
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

  protected validateDraftArgsTypes = (args: Partial<UpsertSellingsArgs>, currentDraft: ISellingsValidationDraft): void => {
    if (args.saleType !== undefined) {
      if (args.saleType === null) {
        currentDraft.saleType = null
      } else {
        const typeValue = Number(args.saleType)
        if (Object.values(SellingTypesEnum).includes(typeValue)) {
          currentDraft.saleType = typeValue
        }
      }
    }

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

    if (args.aliveWeight !== undefined) {
      if (args.aliveWeight === null) {
        currentDraft.aliveWeight = null
      } else {
        const parsedWeight = parsePositiveInteger(args.aliveWeight)
        if (parsedWeight !== null) {
          currentDraft.aliveWeight = parsedWeight
        }
      }
    }

    if (args.deadWeight !== undefined) {
      if (args.deadWeight === null) {
        currentDraft.deadWeight = null
      } else {
        const parsedWeight = parsePositiveInteger(args.deadWeight)
        if (parsedWeight !== null) {
          currentDraft.deadWeight = parsedWeight
        }
      }
    }

    if (args.quantity !== undefined) {
      if (args.quantity === null) {
        currentDraft.quantity = null
      } else {
        const parsedQuantity = parsePositiveInteger(args.quantity)
        if (parsedQuantity !== null) {
          currentDraft.quantity = parsedQuantity
        }
      }
    }

    if (args.unityValue !== undefined) {
      if (args.unityValue === null) {
        currentDraft.unityValue = null
      } else {
        const parsedValue = parseLocalizedNumber(args.unityValue, { precision: 2 })
        if (parsedValue !== null && parsedValue > 0) {
          currentDraft.unityValue = parsedValue
        }
      }
    }

    if (args.arrobaCost !== undefined) {
      if (args.arrobaCost === null) {
        currentDraft.arrobaCost = null
      } else {
        const parsedValue = parseLocalizedNumber(args.arrobaCost, { precision: 2 })
        if (parsedValue !== null && parsedValue > 0) {
          currentDraft.arrobaCost = parsedValue
        }
      }
    }

    if (args.carcassYield !== undefined) {
      if (args.carcassYield === null) {
        currentDraft.carcassYield = null
      } else {
        const parsedValue = Number(args.carcassYield)
        if (!isNaN(parsedValue) && parsedValue > 0) {
          currentDraft.carcassYield = parsedValue
        }
      }
    }

    if (args.observation !== undefined) {
      if (args.observation === null) {
        currentDraft.observation = null
      } else {
        currentDraft.observation = String(args.observation).trim()
      }
    }

    if (args.isExternalDestination !== undefined) {
      if (args.isExternalDestination === null) {
        currentDraft.isExternalDestination = null
      } else {
        currentDraft.isExternalDestination = Boolean(args.isExternalDestination)
      }
    }

    const assignRef = (field: keyof Pick<ISellingsValidationDraft, 'category' | 'retreat' | 'area' | 'destinationFarm' | 'destinationRetreat' | 'destinationArea' | 'harvestConfiguration' | 'animalLotId' | 'fatteningSystemId'>, incoming: IdNameRef | null | undefined) => {
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
    if (args.destinationFarm) assignRef('destinationFarm', args.destinationFarm as IdNameRef | null | undefined)
    if (args.destinationRetreat) assignRef('destinationRetreat', args.destinationRetreat as IdNameRef | null | undefined)
    if (args.destinationArea) assignRef('destinationArea', args.destinationArea as IdNameRef | null | undefined)
    if (args.harvestConfiguration) assignRef('harvestConfiguration', args.harvestConfiguration as IdNameRef | null | undefined)

    if (args.farmId !== undefined) {
      currentDraft.farmId = args.farmId ?? null
    }

    if (args.age !== undefined) {
      if (args.age === null) {
        currentDraft.age = null
      } else {
        const parsedAge = parsePositiveInteger(args.age)
        if (parsedAge !== null) {
          currentDraft.age = parsedAge
        }
      }
    }

    if (args.animalLotId) assignRef('animalLotId', args.animalLotId as IdNameRef | null | undefined)
    if (args.fatteningSystemId) assignRef('fatteningSystemId', args.fatteningSystemId as IdNameRef | null | undefined)
  }

  protected getRequiredFields = (): MissingRule<ISellingsValidationDraft>[] => {
    const isSlaughterLike = (saleType: SellingTypesEnum | null): boolean => [SellingTypesEnum.SLAUGHTER, SellingTypesEnum.CONSUMPTION, SellingTypesEnum.DONATION].includes(saleType ?? (0 as any))

    const rules: MissingRule<ISellingsValidationDraft>[] = [
      { key: SellingField.SaleType, kind: 'number' },
      { key: SellingField.SaleDate, kind: 'string' },
      {
        key: SellingField.AliveWeight,
        kind: 'custom',
        validate: (value) => {
          if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            return false
          }
          return value >= 40
        },
      },
      {
        key: SellingField.Quantity,
        kind: 'custom',
        validate: (value) => {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return false
          }
          return value >= 1
        },
      },
      {
        key: SellingField.UnityValue,
        kind: 'custom',
        validate: (value) => {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return false
          }
          return value >= 1
        },
      },
      { key: SellingField.Category, kind: 'ref' },
      { key: SellingField.Area, kind: 'ref' },
      { key: SellingField.Retreat, kind: 'ref' },
      {
        key: SellingField.HarvestConfiguration,
        kind: 'custom',
        validate: (value) => {
          const v = value as { id?: unknown } | null | undefined
          return !!(v && v.id)
        },
      },

      {
        key: SellingField.DeadWeight,
        kind: 'custom',
        validate: (value, draft) => {
          if (!isSlaughterLike(draft.saleType)) {
            return true
          }
          if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            return false
          }
          if (value < 40) {
            return false
          }
          const aliveWeight = draft.aliveWeight ?? 0
          return value <= aliveWeight
        },
      },
      {
        key: SellingField.ArrobaCost,
        kind: 'custom',
        validate: (value, draft) => {
          if (!isSlaughterLike(draft.saleType)) {
            return true
          }
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return false
          }
          return value >= 1
        },
      },
      {
        key: SellingField.CarcassYield,
        kind: 'custom',
        validate: (value, draft) => {
          if (!isSlaughterLike(draft.saleType)) {
            return true
          }
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return false
          }
          return value >= 0 && value <= 100
        },
      },

      {
        key: SellingField.IsExternalDestination,
        kind: 'custom',
        validate: (value, draft) => {
          if (draft.saleType !== SellingTypesEnum.TRANSFER) {
            return true
          }
          return typeof value === 'boolean'
        },
      },
      {
        key: SellingField.DestinationFarm,
        kind: 'custom',
        validate: (value, draft) => {
          if (draft.saleType === SellingTypesEnum.TRANSFER && draft.isExternalDestination !== true) {
            const v = value as { id?: unknown } | null | undefined
            return !!(v && v.id)
          }
          return true
        },
      },
      {
        key: SellingField.DestinationRetreat,
        kind: 'custom',
        validate: (value, draft) => {
          if (draft.saleType === SellingTypesEnum.TRANSFER && draft.isExternalDestination !== true) {
            const v = value as { id?: unknown } | null | undefined
            return !!(v && v.id)
          }
          return true
        },
      },
      {
        key: SellingField.DestinationArea,
        kind: 'custom',
        validate: (value, draft) => {
          if (draft.saleType === SellingTypesEnum.TRANSFER && draft.isExternalDestination !== true) {
            const v = value as { id?: unknown } | null | undefined
            return !!(v && v.id)
          }
          return true
        },
      },
    ]

    return rules
  }

  protected getSummarySections = (): SummarySections[] => {
    const isSlaughterLike = (saleType: SellingTypesEnum | null): boolean => [SellingTypesEnum.SLAUGHTER, SellingTypesEnum.CONSUMPTION, SellingTypesEnum.DONATION].includes(saleType ?? (0 as any))

    return [
      {
        label: 'Tipo de Venda',
        value: (draft: ISellingsValidationDraft) => {
          const saleType = draft.saleType
          return saleType ? SellingTypesLabels[saleType] : null
        },
      },
      {
        label: 'Data de Venda',
        value: (draft: ISellingsValidationDraft) => this.formatDraftDate(draft.saleDate),
      },
      {
        label: 'Peso Vivo',
        value: (draft: ISellingsValidationDraft) => draft.aliveWeight ?? null,
      },
      {
        label: 'Quantidade',
        value: (draft: ISellingsValidationDraft) => draft.quantity,
      },
      {
        label: 'Valor Unitário',
        value: (draft: ISellingsValidationDraft) => formatCurrency(draft.unityValue),
      },
      {
        label: 'Categoria',
        value: (draft: ISellingsValidationDraft) => draft.category?.name ?? null,
      },
      {
        label: 'Área',
        value: (draft: ISellingsValidationDraft) => draft.area?.name ?? null,
      },
      {
        label: 'Retiro',
        value: (draft: ISellingsValidationDraft) => draft.retreat?.name ?? null,
      },
      {
        label: 'Safra',
        value: (draft: ISellingsValidationDraft) => draft.harvestConfiguration?.name ?? null,
      },
      {
        label: 'Peso Morto',
        value: (draft: ISellingsValidationDraft) => {
          if (!isSlaughterLike(draft.saleType)) return null
          return draft.deadWeight ?? null
        },
      },
      {
        label: 'Custo da Arroba',
        value: (draft: ISellingsValidationDraft) => {
          if (!isSlaughterLike(draft.saleType)) return null
          return formatCurrency(draft.arrobaCost)
        },
      },
      {
        label: 'Rendimento de Carcaça',
        value: (draft: ISellingsValidationDraft) => {
          if (!isSlaughterLike(draft.saleType)) return null
          return draft.carcassYield ?? null
        },
      },
      {
        label: 'Idade',
        value: (draft: ISellingsValidationDraft) => {
          if (draft.saleType !== SellingTypesEnum.SLAUGHTER) return null
          return draft.age ? `${draft.age} meses` : null
        },
      },
      {
        label: 'Sistema de Engorda',
        value: (draft: ISellingsValidationDraft) => {
          if (draft.saleType !== SellingTypesEnum.SLAUGHTER) return null
          return draft.fatteningSystemId?.name ?? null
        },
      },
      {
        label: 'Destino Externo?',
        value: (draft: ISellingsValidationDraft) => {
          if (draft.saleType !== SellingTypesEnum.TRANSFER) return null
          return draft.isExternalDestination ? 'Sim' : 'Não'
        },
      },
      {
        label: 'Fazenda de Destino',
        value: (draft: ISellingsValidationDraft) => {
          if (draft.saleType !== SellingTypesEnum.TRANSFER || draft.isExternalDestination) return null
          return draft.destinationFarm?.name ?? null
        },
      },
      {
        label: 'Área de Destino',
        value: (draft: ISellingsValidationDraft) => {
          if (draft.saleType !== SellingTypesEnum.TRANSFER || draft.isExternalDestination) return null
          return draft.destinationArea?.name ?? null
        },
      },
      {
        label: 'Retiro de Destino',
        value: (draft: ISellingsValidationDraft) => {
          if (draft.saleType !== SellingTypesEnum.TRANSFER || draft.isExternalDestination) return null
          return draft.destinationRetreat?.name ?? null
        },
      },
      {
        label: 'Lote Animal',
        value: (draft: ISellingsValidationDraft) => draft.animalLotId?.name ?? null,
      },
      {
        label: 'Observação',
        value: (draft: ISellingsValidationDraft) => draft.observation ?? null,
      },
    ]
  }

  protected transformToApiPayload = (draft: ISellingsValidationDraft, context: { farmId: number }): ISellingsCreationPayload => {
    const saleType = draft.saleType ?? SellingTypesEnum.SALE

    const finalPayload: ISellingsCreationPayload = {
      sellingDate: draft.saleDate as string,
      sellingTypeId: saleType,
      categoryId: Number(draft.category?.id) || 0,
      aliveWeight: draft.aliveWeight ?? 0,
      quantity: draft.quantity ?? 0,
      unityCost: toIntegerCents(draft.unityValue) ?? 0,
      farmId: context.farmId,
      retreatId: Number(draft.retreat?.id),
      areaId: Number(draft.area?.id),
      harvestConfigurationId: draft.harvestConfiguration?.id ?? null,
      dateFrequencyId: 1,
      observation: draft.observation ?? undefined,
      animalLotId: draft.animalLotId?.id ?? null,
    }

    if ([SellingTypesEnum.SLAUGHTER, SellingTypesEnum.CONSUMPTION, SellingTypesEnum.DONATION].includes(saleType)) {
      finalPayload.deadWeight = draft.deadWeight ?? 0
      finalPayload.arrobaCost = toIntegerCents(draft.arrobaCost) ?? 0
      finalPayload.carcassYield = draft.carcassYield ?? 0
    }

    if (saleType === SellingTypesEnum.SLAUGHTER) {
      finalPayload.age = draft.age ?? undefined
      finalPayload.fatteningSystemId = draft.fatteningSystemId?.id ?? null
    }

    if (saleType === SellingTypesEnum.TRANSFER) {
      finalPayload.isExternalDestination = draft.isExternalDestination ?? false
      if (!draft.isExternalDestination) {
        finalPayload.destinationFarmId = Number(draft.destinationFarm?.id) || undefined
        finalPayload.destinationRetreatId = Number(draft.destinationRetreat?.id) || undefined
        finalPayload.destinationAreaId = Number(draft.destinationArea?.id) || undefined
      }
    }

    return finalPayload
  }

  protected buildListParams = (listType: string, context: { phone: string }): Record<string, any> => {
    switch (listType) {
      case SellingField.Category:
        return {
          advancedFilters: 'isCategory:IN:true',
        }
      case SellingField.Area:
      case SellingField.DestinationArea:
        return {
          advancedFilters: 'isArea:IN:true',
        }
      case SellingField.Retreat:
      case SellingField.DestinationRetreat:
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
      case SellingField.Category:
        return {
          id: item.id,
          name: item.name,
        }
      case SellingField.Area:
      case SellingField.DestinationArea:
        return {
          id: item.id,
          name: item.description,
        }
      case SellingField.Retreat:
      case SellingField.DestinationRetreat:
        return {
          id: item.id,
          name: item.name,
        }
      default:
        return { id: '', name: '' }
    }
  }

  protected getListErrorMessage = (listType: string): string => {
    switch (listType) {
      case SellingField.Category:
        return 'Erro ao listar categorias de venda.'
      case SellingField.Area:
      case SellingField.DestinationArea:
        return 'Erro ao listar áreas.'
      case SellingField.Retreat:
      case SellingField.DestinationRetreat:
        return 'Erro ao listar retiros.'
      default:
        return 'Não foi possível carregar a lista solicitada.'
    }
  }

  protected override buildPartialUpdatePayload(draft: ISellingsValidationDraft, updates: Partial<UpsertSellingsArgs>): Partial<ISellingsCreationPayload> {
    const payload: Partial<ISellingsCreationPayload> = {}
    const has = (field: keyof UpsertSellingsArgs): boolean => Object.prototype.hasOwnProperty.call(updates, field)

    const invalidFields = Object.keys(updates).filter((field) => !this.isFieldValid(field))
    if (invalidFields.length > 0) {
      console.warn(`[SellingService] Invalid fields for update ignored: ${invalidFields.join(', ')}`)
    }

    if (has(SellingField.SaleDate)) {
      payload.sellingDate = draft.saleDate ?? undefined
    }

    if (has(SellingField.SaleType)) {
      payload.sellingTypeId = draft.saleType ?? SellingTypesEnum.SALE
    }

    if (has(SellingField.AliveWeight)) {
      const aliveWeight = Number(draft.aliveWeight ?? 0)
      if (Number.isFinite(aliveWeight) && aliveWeight > 0) {
        payload.aliveWeight = aliveWeight
      }
    }

    if (has(SellingField.DeadWeight)) {
      const deadWeight = Number(draft.deadWeight ?? 0)
      if (Number.isFinite(deadWeight) && deadWeight > 0) {
        payload.deadWeight = deadWeight
      }
    }

    if (has(SellingField.ArrobaCost)) {
      const arrobaCost = toIntegerCents(draft.arrobaCost)
      if (typeof arrobaCost === 'number' && arrobaCost > 0) {
        payload.arrobaCost = arrobaCost
      }
    }

    if (has(SellingField.CarcassYield)) {
      const carcassYield = Number(draft.carcassYield ?? 0)
      if (Number.isFinite(carcassYield) && carcassYield > 0) {
        payload.carcassYield = carcassYield
      }
    }

    if (has(SellingField.Quantity)) {
      const quantity = Number(draft.quantity ?? 0)
      if (Number.isFinite(quantity) && quantity > 0) {
        payload.quantity = quantity
      }
    }

    if (has(SellingField.UnityValue)) {
      const value = toIntegerCents(draft.unityValue)
      if (typeof value === 'number' && value > 0) {
        payload.unityCost = value
      }
    }

    if (has(SellingField.Category)) {
      const categoryId = Number(draft.category?.id)
      if (Number.isFinite(categoryId) && categoryId > 0) {
        payload.categoryId = categoryId
      }
    }

    if (has(SellingField.Retreat)) {
      const retreatId = Number(draft.retreat?.id)
      if (Number.isFinite(retreatId) && retreatId > 0) {
        payload.retreatId = retreatId
      }
    }

    if (has(SellingField.Area)) {
      const areaId = Number(draft.area?.id)
      if (Number.isFinite(areaId) && areaId > 0) {
        payload.areaId = areaId
      }
    }

    if (has(SellingField.Observation)) {
      payload.observation = draft.observation ?? undefined
    }

    if (has(SellingField.DestinationFarm)) {
      const destinationFarmId = Number(draft.destinationFarm?.id)
      if (Number.isFinite(destinationFarmId) && destinationFarmId > 0) {
        payload.destinationFarmId = destinationFarmId
      }
    }

    if (has(SellingField.DestinationRetreat)) {
      const destinationRetreatId = Number(draft.destinationRetreat?.id)
      if (Number.isFinite(destinationRetreatId) && destinationRetreatId > 0) {
        payload.destinationRetreatId = destinationRetreatId
      }
    }

    if (has(SellingField.DestinationArea)) {
      const destinationAreaId = Number(draft.destinationArea?.id)
      if (Number.isFinite(destinationAreaId) && destinationAreaId > 0) {
        payload.destinationAreaId = destinationAreaId
      }
    }

    if (has(SellingField.IsExternalDestination)) {
      payload.isExternalDestination = draft.isExternalDestination ?? false
    }

    if (has(SellingField.Age)) {
      const age = Number(draft.age ?? 0)
      if (Number.isFinite(age) && age > 0) {
        payload.age = age
      }
    }

    if (has(SellingField.AnimalLotId)) {
      const animalLotId = draft.animalLotId?.id
      if (animalLotId) {
        payload.animalLotId = animalLotId
      }
    }

    if (has(SellingField.FatteningSystemId)) {
      const fatteningSystemId = draft.fatteningSystemId?.id
      if (fatteningSystemId) {
        payload.fatteningSystemId = fatteningSystemId
      }
    }

    return payload
  }

  create = async (phone: string, draft: ISellingsValidationDraft): Promise<{ id: string }> => {
    const endpoint = `/1/sellings`
    try {
      const result = await this._createRecord(phone, draft, endpoint)
      return result
    } catch (error) {
      console.error('[SellingService] Erro ao criar registro de venda:', error)
      resetActiveRegistration(phone)
      await clearAllUserIntents(phone)
      await sellingService.clearDraft(phone)
      throw error
    }
  }

  getValidFieldsFormatted = (): string => {
    const fieldLabels: Partial<Record<keyof UpsertSellingsArgs, string>> = {
      saleType: 'tipo de venda',
      saleDate: 'data de venda',
      aliveWeight: 'peso vivo',
      deadWeight: 'peso morto',
      quantity: 'quantidade',
      unityValue: 'valor unitário',
      arrobaCost: 'custo da arroba',
      carcassYield: 'rendimento de carcaça',
      category: 'categoria',
      area: 'área',
      retreat: 'retiro',
      observation: 'observação',
      destinationFarm: 'fazenda de destino',
      destinationRetreat: 'retiro de destino',
      destinationArea: 'área de destino',
      isExternalDestination: 'destino externo',
      age: 'idade',
      animalLotId: 'lote animal',
      fatteningSystemId: 'sistema de engorda',
      harvestConfiguration: 'safra',
    }

    return VALID_EDITABLE_FIELDS.map((field) => fieldLabels[field] || field).join(', ')
  }
}

export const sellingService = new SellingService()
