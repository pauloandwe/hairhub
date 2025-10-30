import { IPurchaseValidationDraft } from '../../../livestocks/Purchase/purchase.types'

export function emptyPurchaseDraft(): IPurchaseValidationDraft {
  return {
    saleDate: null,
    weight: null,
    quantity: null,
    unityValue: null,
    totalValue: null,
    observation: null,
    category: null,
    area: null,
    retreat: null,
    harvestConfiguration: null,
    status: 'collecting',
  }
}
