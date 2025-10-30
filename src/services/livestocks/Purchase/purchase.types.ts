import { IdNameRef } from '../../drafts/types'
import { DraftStatus } from '../../generic/generic.types'

export interface IPurchaseValidationDraft {
  weight: number | null
  quantity: number | null
  unityValue: number | null
  totalValue: number | null
  saleDate: string | null
  observation: string | null
  category: IdNameRef | null
  retreat: IdNameRef | null
  area: IdNameRef | null
  harvestConfiguration: IdNameRef | null
  status?: DraftStatus
  recordId?: string
}

export interface IPurchaseCreationPayload {
  saleTypeId: number
  weight: number
  quantity: number
  unityValue: number
  totalValue: number
  saleDate: string
  dateFrequencyId: number
  observation: string
  isExternalOrigin: boolean
  harvestConfigurationId: number | null
  categoryId: number
  farmId: number
  retreatId: number
  areaId: number
}

export interface PurchaseRecord extends IPurchaseCreationPayload {
  id: string
  createdAt: string
}

export type UpsertPurchaseArgs = Partial<IPurchaseValidationDraft>

export type PurchaseEditField = `${PurchaseField.SaleDate}` | `${PurchaseField.Weight}` | `${PurchaseField.Quantity}` | `${PurchaseField.UnityValue}` | `${PurchaseField.TotalValue}` | `${PurchaseField.Category}` | `${PurchaseField.Retreat}` | `${PurchaseField.Area}` | `${PurchaseField.Observation}`

export type PurchaseMissingField =
  | `${PurchaseField.SaleDate}`
  | `${PurchaseField.Weight}`
  | `${PurchaseField.Quantity}`
  | `${PurchaseField.UnityValue}`
  | `${PurchaseField.TotalValue}`
  | `${PurchaseField.Category}`
  | `${PurchaseField.Retreat}`
  | `${PurchaseField.Area}`
  | `${PurchaseField.Observation}`

export enum PurchaseField {
  Weight = 'weight',
  Quantity = 'quantity',
  UnityValue = 'unityValue',
  TotalValue = 'totalValue',
  SaleDate = 'saleDate',
  Observation = 'observation',
  Category = 'category',
  Retreat = 'retreat',
  Area = 'area',
}
