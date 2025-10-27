import { SimplifiedExpenseField } from '../../../enums/cruds/simplifiedExpenseFields.enums'
import { IdNameRef, PartialIdNameRef } from '../../drafts/types'
import { DraftStatus } from '../../generic/generic.types'
export interface UpsertSimplifiedExpenseArgs {
  emissionDate?: string | null
  supplier: PartialIdNameRef | string
  description: string
  value: number
  dueDate: string | null
  paymentDate: string | null
  paymentMethod: PartialIdNameRef | string | null
  businessArea: PartialIdNameRef | string | null
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
  status?: DraftStatus
  recordId?: string
}

export interface SimplifiedExpenseCreationPayload {
  billType: string
  releaseType: string
  farmId: number
  supplierId: number
  clientId: number | null
  costCenterId: number
  editionDate: string
  paymentDate: string | null
  dueDate: string | null
  value: number
  observation: string
  paymentMethodId: number | null
  businessAreaId: number
  cultureId: number | null
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
