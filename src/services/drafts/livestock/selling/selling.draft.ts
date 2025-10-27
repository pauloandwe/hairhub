import { ISaleValidationDraft } from '../../../livestocks/Selling/selling.types'

export function emptySaleDraft(): ISaleValidationDraft {
  return {
    saleType: null,
    saleDate: null,
    aliveWeight: null,
    deadWeight: null,
    quantity: null,
    unityValue: null,
    arrobaCost: null,
    carcassYield: null,
    category: { id: null, name: null },
    farmId: null,
    retreat: { id: null, name: null },
    area: { id: null, name: null },
    observation: null,
    destinationFarm: { id: null, name: null },
    destinationRetreat: { id: null, name: null },
    destinationArea: { id: null, name: null },
    isExternalDestination: null,
    harvestConfiguration: { id: null, name: null },
    age: null,
    animalLotId: { id: null, name: null },
    fatteningSystemId: { id: null, name: null },
    status: 'collecting',
  }
}
