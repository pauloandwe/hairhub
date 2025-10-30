import { IdNameRef } from '../../drafts/types'
import { DraftStatus } from '../../generic/generic.types'
import { SellingTypesEnum } from '../../../enums/sellingTypes.enum'

export interface ISellingsValidationDraft {
  saleType: SellingTypesEnum | null
  saleDate: string | null
  aliveWeight: number | null
  deadWeight: number | null
  quantity: number | null
  unityValue: number | null
  arrobaCost: number | null
  carcassYield: number | null
  category: IdNameRef | null
  farmId: number | null
  retreat: IdNameRef | null
  area: IdNameRef | null
  observation: string | null
  destinationFarm: IdNameRef | null
  destinationRetreat: IdNameRef | null
  destinationArea: IdNameRef | null
  isExternalDestination: boolean | null
  harvestConfiguration: IdNameRef | null
  age: number | null
  animalLotId: IdNameRef | null
  fatteningSystemId: IdNameRef | null
  status?: DraftStatus
  recordId?: string
}

export interface ISellingsCreationPayload {
  sellingDate: string
  sellingTypeId: number
  categoryId: number
  aliveWeight: number
  deadWeight?: number
  quantity: number
  unityCost: number
  arrobaCost?: number
  farmId: number
  retreatId: number
  areaId: number
  destinationFarmId?: number
  destinationRetreatId?: number
  destinationAreaId?: number
  observation?: string
  harvestConfigurationId?: string | null
  dateFrequencyId?: number
  carcassYield?: number
  isExternalDestination?: boolean
  age?: number
  animalLotId?: string | null
  fatteningSystemId?: string | null
}

export interface SellingsRecord extends ISellingsCreationPayload {
  id: string
  createdAt: string
}

export type UpsertSellingsArgs = Partial<ISellingsValidationDraft>
