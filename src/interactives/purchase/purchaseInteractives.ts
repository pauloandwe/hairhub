import { purchaseFunctions } from '../../functions/livestocks/purchase/purchase.functions'
import { registerEditDeleteHandler } from '../editDeleteHandler'

export function registerPurchaseEditDeleteHandler() {
  registerEditDeleteHandler('PURCHASE_EDIT_DELETE', {
    edit: purchaseFunctions.editPurchaseRegistration,
    delete: purchaseFunctions.deletePurchaseRegistration,
  })
}
