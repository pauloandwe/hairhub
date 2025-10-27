import { isValid, parse, format } from 'date-fns'
import { getBusinessIdForPhone } from '../../../env.config'
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
const VALID_EDITABLE_FIELDS: (keyof UpsertSimplifiedExpenseArgs)[] = [
  SimplifiedExpenseField.EmissionDate,
  SimplifiedExpenseField.Supplier,
  SimplifiedExpenseField.Description,
  SimplifiedExpenseField.Value,
  SimplifiedExpenseField.DueDate,
  SimplifiedExpenseField.PaymentDate,
  SimplifiedExpenseField.PaymentMethod,
  SimplifiedExpenseField.BusinessArea,
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

  protected validateDraftArgsTypes = (args: Partial<UpsertSimplifiedExpenseArgs>, currentDraft: SimplifiedExpenseValidationDraft): void => {
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
    if (args.emissionDate) {
      const date = parse(args.emissionDate, 'dd/MM/yyyy', new Date())
      currentDraft.emissionDate = isValid(date) ? format(date, 'yyyy-MM-dd') : currentDraft.emissionDate
    }
    if (args.dueDate) {
      const date = parse(args.dueDate, 'dd/MM/yyyy', new Date())
      currentDraft.dueDate = isValid(date) ? format(date, 'yyyy-MM-dd') : currentDraft.dueDate
    }
    if (args.paymentDate) {
      const date = parse(args.paymentDate, 'dd/MM/yyyy', new Date())
      currentDraft.paymentDate = isValid(date) ? format(date, 'yyyy-MM-dd') : currentDraft.paymentDate
    }
    if (args.description) currentDraft.description = args.description ?? 'Lançamento realizado via Inttegra Assistente'
    if (args.supplier) mergeIdNameRef(currentDraft.supplier, args.supplier)
    if (args.paymentMethod) mergeIdNameRef(currentDraft.paymentMethod, args.paymentMethod)
    if (args.businessArea) mergeIdNameRef(currentDraft.businessArea, args.businessArea)
  }

  protected getRequiredFields = (): MissingRule<SimplifiedExpenseValidationDraft>[] => {
    return [
      { key: SimplifiedExpenseField.Supplier, kind: 'ref' },
      { key: SimplifiedExpenseField.Value, kind: 'number' },
      { key: SimplifiedExpenseField.BusinessArea, kind: 'ref' },
    ]
  }

  protected getSummarySections = (): SummarySections[] => {
    return [
      {
        label: 'Data de emissão',
        value: (draft: SimplifiedExpenseValidationDraft) => DateFormatter.formatToBrazilianDate(draft.emissionDate),
      },
      {
        label: 'Fornecedor',
        value: (draft: SimplifiedExpenseValidationDraft) => draft.supplier.name,
      },
      {
        label: 'Valor',
        value: (draft: SimplifiedExpenseValidationDraft) =>
          new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(Number(draft.value)),
      },
      {
        label: 'Data de Vencimento',
        value: (draft: SimplifiedExpenseValidationDraft) => DateFormatter.formatToBrazilianDate(draft?.dueDate),
      },

      {
        label: 'Data de Pagamento',
        value: (draft: SimplifiedExpenseValidationDraft) => {
          return DateFormatter.formatToBrazilianDate(draft.paymentDate)
        },
      },
      {
        label: 'Método de Pagamento',
        value: (draft: SimplifiedExpenseValidationDraft) => {
          return draft.paymentMethod.name ?? null
        },
      },
      {
        label: 'Área de Negócio',
        value: (draft: SimplifiedExpenseValidationDraft) => {
          return draft.businessArea.name ?? null
        },
      },
    ]
  }

  protected transformToApiPayload = (draft: SimplifiedExpenseValidationDraft, context: { farmId: number }): SimplifiedExpenseCreationPayload => {
    const finalPayload: SimplifiedExpenseCreationPayload = {
      billType: 'SIMPLIFIED',
      releaseType: 'TO_PAY',
      farmId: context.farmId,
      supplierId: Number(draft.supplier.id),
      clientId: null,
      costCenterId: 616,
      editionDate: draft.emissionDate ?? new Date().toISOString(),
      paymentDate: draft?.paymentDate ?? null,
      dueDate: draft?.dueDate ?? null,
      value: (draft.value ?? 0) * 100,
      observation: draft?.description ?? 'Lançamento realizado via Inttegra Assistente',
      paymentMethodId: Number(draft.paymentMethod.id) > 0 ? Number(draft.paymentMethod.id) : null,
      businessAreaId: Number(draft?.businessArea?.id ?? 12),
      cultureId: null,
    }

    return finalPayload
  }

  protected buildListParams = (listType: string, context: { phone: string }): Record<string, any> => {
    switch (listType) {
      case SimplifiedExpenseField.Supplier:
        // const institutionId = getInstitutionIdForPhone(context.phone)
        const institutionId = 0
        return {
          filters: `institutionId:${institutionId}`,
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
      default:
        return {}
    }
  }

  protected extractDataFromResult = (listType: string, result: any): any[] => {
    systemLogger.info(
      {
        data: result,
        type: listType,
      },
      'Fetched list form the API',
    )
    switch (listType) {
      case SimplifiedExpenseField.Supplier:
      case SimplifiedExpenseField.BusinessArea:
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
        return {
          id: item.id,
          name: item.name,
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
      default:
        return 'Erro ao carregar a lista.'
    }
  }

  getValidFieldsFormatted = (): string => {
    const fieldLabels: Partial<Record<keyof UpsertSimplifiedExpenseArgs, string>> = {
      emissionDate: 'data de emissão',
      supplier: 'fornecedor',
      description: 'descrição',
      value: 'valor',
      dueDate: 'data de vencimento',
      paymentDate: 'data de pagamento',
      paymentMethod: 'forma de pagamento',
      businessArea: 'área de negócio',
    }

    return VALID_EDITABLE_FIELDS.map((field) => fieldLabels[field] || field).join(', ')
  }

  async listSuppliers(phone: string): Promise<SelectionItem[]> {
    const type = SimplifiedExpenseField.Supplier
    const endpoint = '/external-partners'
    return this.fetchSelectionList(phone, type, endpoint)
  }

  async listBusinessAreas(phone: string): Promise<SelectionItem[]> {
    const farmId = getBusinessIdForPhone(phone)
    const endpoint = `/business-area/${farmId}/list-by-farm`
    const type = SimplifiedExpenseField.BusinessArea
    return this.fetchSelectionList(phone, type, endpoint)
  }

  async listPaymentMethods(phone: string): Promise<SelectionItem[]> {
    const endpoint = '/payment-methods'
    const type = SimplifiedExpenseField.PaymentMethod
    return this.fetchSelectionList(phone, type, endpoint)
  }

  protected override buildPartialUpdatePayload(draft: SimplifiedExpenseValidationDraft, updates: Partial<UpsertSimplifiedExpenseArgs>): Partial<SimplifiedExpenseCreationPayload> {
    const payload: Partial<SimplifiedExpenseCreationPayload> = {}
    const has = (field: keyof UpsertSimplifiedExpenseArgs): boolean => Object.prototype.hasOwnProperty.call(updates, field)

    if (has(SimplifiedExpenseField.EmissionDate)) {
      payload.editionDate = draft.emissionDate ?? new Date().toISOString()
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
      payload.dueDate = draft.dueDate ?? null
    }

    if (has(SimplifiedExpenseField.PaymentDate)) {
      payload.paymentDate = draft.paymentDate ?? null
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

    return payload
  }
}

export const simplifiedExpenseService = new SimplifiedExpenseService()
