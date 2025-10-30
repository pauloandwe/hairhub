import { addMinutes, format, isValid, parse, parseISO } from 'date-fns'
import { BirthField } from '../../../enums/cruds/birthFields.enum'
import { emptyBirthDraft } from '../../drafts/livestock/birth/birth.draft'
import { GenericService } from '../../generic/generic.service'
import { BirthRecord, IBirthCreationPayload, IBirthValidationDraft, UpsertBirthArgs } from './birth.types'
import { MissingRule } from '../../drafts/draft-flow.utils'
import { SelectionItem, SummarySections } from '../../generic/generic.types'
import { resetActiveRegistration } from '../../../env.config'
import { convertEnumToSelectArray } from '../../../helpers/converters/converters'
import { Categories, CategoriesLabels } from '../../../enums/birthCategories.enums'
import { SelectArrayItem } from '../../../helpers/converters/converters.type'
import { mergeIdNameRef } from '../../drafts/ref.utils'
import { IdNameRef } from '../../drafts/types'
import { clearAllUserIntents } from '../../intent-history.service'
import { parsePositiveInteger } from '../../../utils/numbers'

const autoCompleteEndpoint = '/births/chat-auto-complete'

const VALID_EDITABLE_FIELDS: (keyof UpsertBirthArgs)[] = [BirthField.Area, BirthField.Category, BirthField.Quantity, BirthField.Retreat, BirthField.BirthDate]

export class BirthService extends GenericService<IBirthValidationDraft, IBirthCreationPayload, BirthRecord, UpsertBirthArgs> {
  constructor() {
    super('birth', emptyBirthDraft, process.env.LIVESTOCKS_URL || '', autoCompleteEndpoint, VALID_EDITABLE_FIELDS, {
      endpoints: {
        create: ({ farmId }) => (farmId ? `/${farmId}/births` : '/births'),
        update: ({ farmId }) => (farmId ? `/${farmId}/births` : '/births'),
        patch: ({ farmId }) => (farmId ? `/${farmId}/births` : '/births'),
        delete: ({ farmId }) => (farmId ? `/${farmId}/births` : '/births'),
      },
    })
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

  protected validateDraftArgsTypes = (args: Partial<UpsertBirthArgs>, currentDraft: IBirthValidationDraft): void => {
    if (args.birthDate) {
      const rawBirthDate = String(args.birthDate).trim()
      if (rawBirthDate) {
        let parsedDate = parseISO(rawBirthDate)

        if (!isValid(parsedDate)) {
          const datePortion = rawBirthDate.length >= 10 ? rawBirthDate.slice(0, 10) : rawBirthDate
          parsedDate = parse(datePortion, 'dd/MM/yyyy', new Date())
        }

        if (isValid(parsedDate)) {
          currentDraft.birthDate = format(parsedDate, 'yyyy-MM-dd')
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

    const assignRef = (field: keyof Pick<IBirthValidationDraft, 'gender' | 'category' | 'retreat' | 'area' | 'harvestConfiguration'>, incoming: IdNameRef | null | undefined) => {
      console.log('\n\n')
      console.log('[BirthService] assignRef', field, incoming)
      console.log('\n\n')
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

    if (args.gender) assignRef('gender', args.gender as IdNameRef | null | undefined)
    if (args.category) assignRef('category', args.category as IdNameRef | null | undefined)
    if (args.retreat) assignRef('retreat', args.retreat as IdNameRef | null | undefined)
    if (args.area) assignRef('area', args.area as IdNameRef | null | undefined)
    if (args.harvestConfiguration) assignRef('harvestConfiguration', args.harvestConfiguration as IdNameRef | null | undefined)

    if (args.farmId !== undefined) {
      currentDraft.farmId = args.farmId ?? null
    }
  }

  protected getRequiredFields = (): MissingRule<IBirthValidationDraft>[] => {
    return [
      { key: BirthField.BirthDate, kind: 'string' },
      { key: BirthField.Quantity, kind: 'number' },
      { key: BirthField.Category, kind: 'ref' },
      { key: BirthField.Area, kind: 'ref' },
      { key: BirthField.Retreat, kind: 'ref' },
    ]
  }

  protected getSummarySections = (): SummarySections[] => {
    return [
      {
        label: 'Data de nascimento',
        value: (draft: IBirthValidationDraft) => this.formatDraftDate(draft.birthDate),
      },
      {
        label: 'Quantidade',
        value: (draft: IBirthValidationDraft) => draft.quantity,
      },
      {
        label: 'Gênero',
        value: (draft: IBirthValidationDraft) => {
          return draft?.gender?.name ?? null
        },
      },
      {
        label: 'Categoria',
        value: (draft: IBirthValidationDraft) => {
          return draft.category?.name ?? null
        },
      },
      {
        label: 'Área',
        value: (draft: IBirthValidationDraft) => {
          return draft.area?.name ?? null
        },
      },
      {
        label: 'Retiro',
        value: (draft: IBirthValidationDraft) => draft.retreat?.name ?? null,
      },
    ]
  }

  protected transformToApiPayload = (draft: IBirthValidationDraft, context: { farmId: number }): IBirthCreationPayload => {
    const finalPayload: IBirthCreationPayload = {
      birthDate: draft.birthDate as string,
      quantity: draft.quantity ?? 0,
      genderId: Number(draft.gender?.id),
      categoryId: Number(draft.category?.id),
      farmId: context.farmId,
      retreatId: Number(draft.retreat?.id),
      areaId: Number(draft.area?.id),
      harvestConfigurationId: draft.harvestConfiguration?.id ?? null,
      dateFrequencyId: 1,
    }

    return finalPayload
  }

  protected buildListParams = (listType: string, context: { phone: string }): Record<string, any> => {
    switch (listType) {
      case BirthField.Category:
        return {
          advancedFilters: 'isCategory:IN:true',
        }
      case BirthField.Area:
        return {
          advancedFilters: 'isArea:IN:true',
        }
      case BirthField.Retreat:
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
      case BirthField.Category:
        return {
          id: item.id,
          name: item.name,
        }
      case BirthField.Area:
        return {
          id: item.id,
          name: item.description,
        }
      case BirthField.Retreat:
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
      case BirthField.Category:
        return 'Erro ao listar categorias de nascimento.'
      case BirthField.Area:
        return 'Erro ao listar áreas.'
      case BirthField.Retreat:
        return 'Erro ao listar retiros.'
      default:
        return 'Não foi possível carregar a lista solicitada.'
    }
  }

  protected override buildPartialUpdatePayload(draft: IBirthValidationDraft, updates: Partial<UpsertBirthArgs>): Partial<IBirthCreationPayload> {
    const payload: Partial<IBirthCreationPayload> = {}
    const has = (field: keyof UpsertBirthArgs): boolean => Object.prototype.hasOwnProperty.call(updates, field)

    const invalidFields = Object.keys(updates).filter((field) => !this.isFieldValid(field))
    if (invalidFields.length > 0) {
      console.warn(`[BirthService] Invalid fields for update ignored: ${invalidFields.join(', ')}`)
    }

    if (has(BirthField.BirthDate)) {
      payload.birthDate = draft.birthDate ?? undefined
    }

    if (has(BirthField.Quantity)) {
      const quantity = Number(draft.quantity ?? 0)
      if (Number.isFinite(quantity) && quantity > 0) {
        payload.quantity = quantity
      }
    }

    if (has(BirthField.Category)) {
      const categoryId = Number(draft.category?.id)
      if (Number.isFinite(categoryId) && categoryId > 0) {
        payload.categoryId = categoryId
      }
    }

    if (has(BirthField.Retreat)) {
      const retreatId = Number(draft.retreat?.id)
      if (Number.isFinite(retreatId) && retreatId > 0) {
        payload.retreatId = retreatId
      }
    }

    if (has(BirthField.Area)) {
      const areaId = Number(draft.area?.id)
      if (Number.isFinite(areaId) && areaId > 0) {
        payload.areaId = areaId
      }
    }

    return payload
  }

  create = async (phone: string, draft: IBirthValidationDraft): Promise<{ id: string }> => {
    const endpoint = `/1/births`
    try {
      const result = await this._createRecord(phone, draft, endpoint)
      return result
    } catch (error) {
      console.error('[BirthService] Erro ao criar registro de nascimento:', error)
      resetActiveRegistration(phone)
      await clearAllUserIntents(phone)
      await birthService.clearDraft(phone)
      throw error
    }
  }

  async listBirthCategories(): Promise<SelectArrayItem[]> {
    return convertEnumToSelectArray(Categories, CategoriesLabels)
  }

  getValidFieldsFormatted = (): string => {
    const fieldLabels: Partial<Record<keyof UpsertBirthArgs, string>> = {
      birthDate: 'data de nascimento',
      quantity: 'quantidade',
      category: 'categoria',
      area: 'área',
      retreat: 'retiro',
      gender: 'gênero',
    }

    return VALID_EDITABLE_FIELDS.map((field) => fieldLabels[field] || field).join(', ')
  }
}

export const birthService = new BirthService()
