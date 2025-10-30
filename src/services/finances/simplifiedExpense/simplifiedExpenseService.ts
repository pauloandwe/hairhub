import { emptyExpenseDraft } from '../../drafts/simplifiedExpense/simplified-expenses.draft'
import { GenericService } from '../../generic/generic.service'
import { SelectionItem, SummarySections } from '../../generic/generic.types'
import { SimpleExpenseRecord, SimplifiedExpenseCreationPayload, SimplifiedExpenseValidationDraft, UpsertSimplifiedExpenseArgs } from './simplified-expense.types'
import { mergeIdNameRef } from '../../drafts/ref.utils'
import { MissingRule } from '../../drafts/draft-flow.utils'
import { systemLogger } from '../../../utils/pino'
import { SimplifiedExpenseField } from '../../../enums/cruds/simplifiedExpenseFields.enums'
import { DateFormatter } from '../../../utils/date'
import { parseLocalizedNumber } from '../../../utils/numbers'

const autoCompleteEndpoint = '/bills/simplified-financial-entry/chat-auto-complete'
const VALID_EDITABLE_FIELDS: (keyof UpsertSimplifiedExpenseArgs | 'costCenter')[] = [
  SimplifiedExpenseField.EmissionDate,
  SimplifiedExpenseField.Supplier,
  SimplifiedExpenseField.Description,
  SimplifiedExpenseField.Value,
  SimplifiedExpenseField.DueDate,
  SimplifiedExpenseField.PaymentDate,
  SimplifiedExpenseField.PaymentMethod,
  SimplifiedExpenseField.BusinessArea,
  SimplifiedExpenseField.ProductServiceName,
  SimplifiedExpenseField.CostCenter,
]

export class SimplifiedExpenseService extends GenericService<SimplifiedExpenseValidationDraft, SimplifiedExpenseCreationPayload, SimpleExpenseRecord, UpsertSimplifiedExpenseArgs> {
  constructor() {
    super('simplifiedExpense', emptyExpenseDraft, process.env.FINANCES_URL || '', autoCompleteEndpoint, VALID_EDITABLE_FIELDS, {
      endpoints: {
        create: '/bills/simplified-financial-entry',
        update: '/bills/simplified-financial-entry',
        patch: '/bills/simplified-financial-entry',
        delete: '/bills/simplified',
      },
    })
  }

  protected validateDraftArgsTypes = (args: Partial<UpsertSimplifiedExpenseArgs> & { costCenter?: any }, currentDraft: SimplifiedExpenseValidationDraft): void => {
    if (args.value !== undefined) {
      if (args.value === null) {
        currentDraft.value = null
      } else {
        const parsedValue = parseLocalizedNumber(args.value, { precision: 2 })
        if (parsedValue !== null && parsedValue > 0) {
          currentDraft.value = parsedValue
        }
      }
    }
    if (args.emissionDate !== undefined) {
      const normalizedEmission = DateFormatter.normalizeToISODate(args.emissionDate)
      if (normalizedEmission && DateFormatter.isValidISODate(normalizedEmission)) {
        currentDraft.emissionDate = normalizedEmission
      }
    }
    if (args.dueDate !== undefined) {
      const normalizedDue = DateFormatter.normalizeToISODate(args.dueDate)
      if (normalizedDue && DateFormatter.isValidISODate(normalizedDue)) {
        currentDraft.dueDate = normalizedDue
      }
    }
    if (args.paymentDate !== undefined) {
      const normalizedPayment = DateFormatter.normalizeToISODate(args.paymentDate)
      if (normalizedPayment && DateFormatter.isValidISODate(normalizedPayment)) {
        currentDraft.paymentDate = normalizedPayment
      }
    }
    if (args.description) currentDraft.description = args.description ?? 'Lançamento realizado via Inttegra Assistente'
    if (args.productServiceName) currentDraft.productServiceName = args.productServiceName
    if (args.supplier) mergeIdNameRef(currentDraft.supplier, args.supplier)
    if (args.paymentMethod) mergeIdNameRef(currentDraft.paymentMethod, args.paymentMethod)
    if (args.businessArea) mergeIdNameRef(currentDraft.businessArea, args.businessArea)
    if (args.costCenter) {
      if (!currentDraft.costCenter) {
        currentDraft.costCenter = { id: null, name: null }
      }
      mergeIdNameRef(currentDraft.costCenter, args.costCenter)
    }
  }

  protected getRequiredFields = (): MissingRule<SimplifiedExpenseValidationDraft>[] => {
    return [
      { key: SimplifiedExpenseField.Supplier, kind: 'ref' },
      { key: SimplifiedExpenseField.Value, kind: 'number' },
      { key: SimplifiedExpenseField.BusinessArea, kind: 'ref' },
      { key: SimplifiedExpenseField.CostCenter, kind: 'ref' },
    ]
  }

  protected getSummarySections = (): SummarySections[] => {
    return [
      {
        label: 'Data de emissão',
        value: (draft: SimplifiedExpenseValidationDraft) => DateFormatter.formatToBrazilianDate(draft?.emissionDate),
      },
      {
        label: 'Fornecedor',
        value: (draft: SimplifiedExpenseValidationDraft) => draft?.supplier.name,
      },
      {
        label: 'Valor',
        value: (draft: SimplifiedExpenseValidationDraft) =>
          new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(Number(draft?.value)),
      },
      {
        label: 'Data de Vencimento',
        value: (draft: SimplifiedExpenseValidationDraft) => DateFormatter.formatToBrazilianDate(draft?.dueDate),
      },

      {
        label: 'Data de Pagamento',
        value: (draft: SimplifiedExpenseValidationDraft) => {
          return DateFormatter.formatToBrazilianDate(draft?.paymentDate)
        },
      },
      {
        label: 'Método de Pagamento',
        value: (draft: SimplifiedExpenseValidationDraft) => {
          return draft?.paymentMethod.name ?? null
        },
      },
      {
        label: 'Área de Negócio',
        value: (draft: SimplifiedExpenseValidationDraft) => {
          return draft?.businessArea.name ?? null
        },
      },
      {
        label: 'Centro de Custo',
        value: (draft: SimplifiedExpenseValidationDraft) => {
          return draft?.costCenter?.name ?? null
        },
      },
    ]
  }

  protected transformToApiPayload = (draft: SimplifiedExpenseValidationDraft, context: { farmId: number }): SimplifiedExpenseCreationPayload => {
    const normalizeOrNull = (value?: string | Date | null) => {
      const normalized = DateFormatter.normalizeToISODate(value)
      return normalized && DateFormatter.isValidISODate(normalized) ? normalized : null
    }
    const normalizeOrNow = (value?: string | Date | null) => normalizeOrNull(value) ?? DateFormatter.toISODate(new Date())

    const finalPayload: SimplifiedExpenseCreationPayload = {
      billType: 'SIMPLIFIED',
      releaseType: 'TO_PAY',
      farmId: context.farmId,
      supplierId: Number(draft.supplier.id),
      clientId: null,
      costCenterId: draft?.costCenter?.id ? Number(draft.costCenter.id) : undefined,
      editionDate: normalizeOrNow(draft.emissionDate),
      paymentDate: normalizeOrNull(draft?.paymentDate),
      dueDate: normalizeOrNull(draft?.dueDate),
      value: (draft.value ?? 0) * 100,
      observation: draft?.description ?? 'Lançamento realizado via Inttegra Assistente',
      paymentMethodId: Number(draft.paymentMethod.id) > 0 ? Number(draft.paymentMethod.id) : null,
      businessAreaId: Number(draft?.businessArea?.id ?? 12),
      cultureId: null,
      productServiceName: draft?.productServiceName ?? '',
    }

    return finalPayload
  }

  protected buildListParams = (listType: string, context: { phone: string }): Record<string, any> => {
    switch (listType) {
      case SimplifiedExpenseField.Supplier:
        return {
          advancedFilters: 'isSupplier:EQ:1;isActive:IN:1',
        }
      case 'businessAreas':
        return {
          advancedFilters: 'situation:IN:true',
        }
      case SimplifiedExpenseField.PaymentMethod:
        return {
          advancedFilters: 'code:NOT_EQ:NULL',
        }
      case SimplifiedExpenseField.CostCenter:
        return {}
      default:
        return {}
    }
  }

  protected extractDataFromResult = (listType: string, result: any): any[] => {
    systemLogger.info(
      {
        data: result?.data?.data || [],
        type: listType,
      },
      'Fetched list form the API',
    )
    switch (listType) {
      case SimplifiedExpenseField.Supplier:
      case SimplifiedExpenseField.BusinessArea:
      case SimplifiedExpenseField.CostCenter:
        return result?.data?.data ?? []
      case SimplifiedExpenseField.PaymentMethod:
      case 'autoComplete':
        return result?.data?.data || []
      default:
        return []
    }
  }

  protected formatItemToSelection = (listType: string, item: any): SelectionItem => {
    switch (listType) {
      case SimplifiedExpenseField.Supplier:
      case SimplifiedExpenseField.PaymentMethod:
      case SimplifiedExpenseField.CostCenter:
        return {
          id: item.id,
          name: item.name,
          ...(item?.description ? { description: item.description } : {}),
          ...(item?.index !== undefined && item?.index !== null ? { index: item.index } : {}),
        }
      case SimplifiedExpenseField.BusinessArea:
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
      case SimplifiedExpenseField.Supplier:
        return 'Erro ao listar fornecedores.'
      case SimplifiedExpenseField.BusinessArea:
        return 'Erro ao listar áreas de negócio.'
      case SimplifiedExpenseField.PaymentMethod:
        return 'Erro ao listar métodos de pagamento.'
      case SimplifiedExpenseField.CostCenter:
        return 'Erro ao listar centros de custo.'
      default:
        return 'Erro ao carregar a lista.'
    }
  }

  getValidFieldsFormatted = (): string => {
    const fieldLabels: Partial<Record<keyof UpsertSimplifiedExpenseArgs | 'costCenter', string>> = {
      emissionDate: 'data de emissão',
      supplier: 'fornecedor',
      description: 'descrição',
      value: 'valor',
      dueDate: 'data de vencimento',
      paymentDate: 'data de pagamento',
      paymentMethod: 'forma de pagamento',
      businessArea: 'área de negócio',
      productServiceName: 'produto/serviço',
      costCenter: 'centro de custo',
    }

    return VALID_EDITABLE_FIELDS.map((field) => fieldLabels[field] || field).join(', ')
  }

  async listSuppliers(phone: string): Promise<SelectionItem[]> {
    const type = SimplifiedExpenseField.Supplier
    const endpoint = '/external-partners'
    return this.fetchSelectionList(phone, type, endpoint)
  }

  async listBusinessAreas(phone: string): Promise<SelectionItem[]> {
    const endpoint = `/business-area/list-by-farm`
    const type = SimplifiedExpenseField.BusinessArea
    return this.fetchSelectionList(phone, type, endpoint)
  }

  async listPaymentMethods(phone: string): Promise<SelectionItem[]> {
    const endpoint = '/payment-methods'
    const type = SimplifiedExpenseField.PaymentMethod
    return this.fetchSelectionList(phone, type, endpoint)
  }

  async listCostCenters(phone: string, options?: { advancedFilters?: string }): Promise<SelectionItem[]> {
    const endpoint = '/cost-center'
    const type = SimplifiedExpenseField.CostCenter
    return this.fetchSelectionList(phone, type, endpoint, options)
  }

  private buildCostCenterSearchAdvancedFilters(query: string): string | null {
    if (!query) return null

    const normalized = query.trim()
    if (!normalized) return null

    const indexMatches = normalized.match(/(\d+\.)*\d+/g) || []
    const textPart = normalized.replace(/(\d+\.)*\d+/g, '').trim()

    const filters: string[] = []

    if (indexMatches.length > 0) {
      filters.push(`index:IN:${indexMatches.join(',')}`)
    }

    if (textPart) {
      filters.push(`name:LIKE:${textPart}`)
    } else if (filters.length === 0) {
      filters.push(`name:LIKE:${normalized}`)
    }

    return filters.length > 0 ? filters.join(';') : null
  }

  async searchCostCenters(phone: string, query: string): Promise<SelectionItem[]> {
    const advancedFilters = this.buildCostCenterSearchAdvancedFilters(query)
    if (!advancedFilters) {
      return []
    }

    return this.listCostCenters(phone, { advancedFilters })
  }

  protected override buildPartialUpdatePayload(draft: SimplifiedExpenseValidationDraft, updates: Partial<UpsertSimplifiedExpenseArgs> & { costCenter?: any }): Partial<SimplifiedExpenseCreationPayload> {
    const payload: Partial<SimplifiedExpenseCreationPayload> = {}
    const has = (field: keyof UpsertSimplifiedExpenseArgs | 'costCenter'): boolean => Object.prototype.hasOwnProperty.call(updates, field)
    const normalizeOrNull = (value?: string | Date | null) => {
      const normalized = DateFormatter.normalizeToISODate(value)
      return normalized && DateFormatter.isValidISODate(normalized) ? normalized : null
    }
    const normalizeOrNow = (value?: string | Date | null) => normalizeOrNull(value) ?? DateFormatter.toISODate(new Date())

    if (has(SimplifiedExpenseField.EmissionDate)) {
      payload.editionDate = normalizeOrNow(draft.emissionDate)
    }

    if (has(SimplifiedExpenseField.Supplier)) {
      const supplierId = Number(draft.supplier.id)
      if (Number.isFinite(supplierId) && supplierId > 0) {
        payload.supplierId = supplierId
      }
    }

    if (has(SimplifiedExpenseField.Description)) {
      payload.observation = draft.description ?? 'Lançamento realizado via Inttegra Assistente'
    }

    if (has(SimplifiedExpenseField.Value)) {
      const numericValue = Number(draft.value ?? 0)
      const normalizedValue = Math.round(numericValue * 100)
      payload.value = Number.isFinite(normalizedValue) ? normalizedValue : 0
    }

    if (has(SimplifiedExpenseField.DueDate)) {
      payload.dueDate = normalizeOrNull(draft.dueDate)
    }

    if (has(SimplifiedExpenseField.PaymentDate)) {
      payload.paymentDate = normalizeOrNull(draft.paymentDate)
    }

    if (has(SimplifiedExpenseField.PaymentMethod)) {
      const paymentMethodId = Number(draft.paymentMethod.id)
      payload.paymentMethodId = paymentMethodId > 0 ? paymentMethodId : null
    }

    if (has(SimplifiedExpenseField.BusinessArea)) {
      const businessAreaId = Number(draft.businessArea.id)
      if (Number.isFinite(businessAreaId) && businessAreaId > 0) {
        payload.businessAreaId = businessAreaId
      }
    }

    if (has(SimplifiedExpenseField.ProductServiceName)) {
      payload.productServiceName = draft.productServiceName ?? ''
    }

    if (has(SimplifiedExpenseField.CostCenter)) {
      const costCenterId = Number(draft.costCenter?.id)
      payload.costCenterId = costCenterId > 0 ? costCenterId : undefined
    }

    return payload
  }
}

export const simplifiedExpenseService = new SimplifiedExpenseService()
