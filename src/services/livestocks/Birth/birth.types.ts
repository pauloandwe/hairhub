import { IdNameRef } from '../../drafts/types'
import { DraftStatus } from '../../generic/generic.types'

export interface IBirthValidationDraft {
  birthDate: string | null
  quantity: number | null
  gender: IdNameRef | null
  category: IdNameRef | null
  farmId: number | null
  retreat: IdNameRef | null
  area: IdNameRef | null
  harvestConfiguration: IdNameRef | null
  status?: DraftStatus
  recordId?: string
}

export interface IBirthCreationPayload {
  birthDate: string
  quantity: number
  genderId: number
  categoryId: number
  farmId: number
  retreatId: number
  areaId: number
  harvestConfigurationId: string | null
  dateFrequencyId?: number
}

export interface BirthRecord extends IBirthCreationPayload {
  id: string
  createdAt: string
}

export type UpsertBirthArgs = Partial<IBirthValidationDraft>
