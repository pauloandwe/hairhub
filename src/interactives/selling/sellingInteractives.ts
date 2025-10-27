import { registerEditDeleteHandler } from '../editDeleteHandler'
import { saleFunctions } from '../../functions/livestocks/selling/selling.functions'

export function registerSellingEditDeleteHandler() {
  registerEditDeleteHandler('SALE_EDIT_DELETE', {
    edit: saleFunctions.editSaleRegistration,
    delete: saleFunctions.deleteSaleRegistration,
  })
}
