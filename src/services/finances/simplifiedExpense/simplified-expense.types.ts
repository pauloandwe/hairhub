import { SimplifiedExpenseField } from '../../../enums/cruds/simplifiedExpenseFields.enums'
import { IdNameRef, PartialIdNameRef } from '../../drafts/types'
import { DraftStatus } from '../../generic/generic.types'

export type NamedRefSVC = {
  id?: number | null
  name?: string | null
}

export interface CostCenterSuggestion {
  id: number
  product_service_name: string
  cost_center_id: number | null
  similarity_score: number
  is_institution_match: boolean
  cost_center_index?: string | null
  matched_product_service_name?: string | null
  cost_center?: NamedRefSVC | null
  original_cost_center?: NamedRefSVC | null
  original_sub_cost_center?: NamedRefSVC | null
  original_class?: NamedRefSVC | null
}
export interface UpsertSimplifiedExpenseArgs {
  emissionDate?: string | null
  supplier: PartialIdNameRef | string
  description: string
  value: number
  dueDate: string | null
  paymentDate: string | null
  paymentMethod: PartialIdNameRef | string | null
  businessArea: PartialIdNameRef | string | null
  productServiceName: string
  costCenter?: PartialIdNameRef | string | null
}

export interface SimplifiedExpenseValidationDraft {
  emissionDate: string | null
  supplier: IdNameRef
  description: string | null
  value: number | null
  dueDate: string | null
  paymentDate: string | null
  paymentMethod: IdNameRef
  businessArea: IdNameRef
  productServiceName?: string | null
  costCenter: IdNameRef
  costCenterSuggestions?: CostCenterSuggestion[]
  needsManualCostCenterSelection?: boolean
  status?: DraftStatus
  recordId?: string
}

export interface SimplifiedExpenseCreationPayload {
  billType: string
  releaseType: string
  farmId: number
  supplierId: number
  clientId: number | null
  costCenterId?: number
  editionDate: string
  paymentDate: string | null
  dueDate: string | null
  value: number
  observation: string
  paymentMethodId: number | null
  businessAreaId: number
  cultureId: number | null
  productServiceName: string
}

export type SimplifiedExpenseFields = `${SimplifiedExpenseField}`

export type SimplifiedExpenseRequiredFields = `${SimplifiedExpenseField.EmissionDate}` | `${SimplifiedExpenseField.Supplier}` | `${SimplifiedExpenseField.Value}` | `${SimplifiedExpenseField.BusinessArea}`

export interface BusinessAreaResponse {
  id: number
  description: string
  observation: string
  situation: boolean
  description_es: string
  description_en: string
  observation_es: string
  observation_en: string
}

export interface SimpleExpenseRecord extends SimplifiedExpenseCreationPayload {
  id: string
  createdAt: string
}
