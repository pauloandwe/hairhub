import { registerEditDeleteHandler } from '../editDeleteHandler'
import { birthFunctions } from '../../functions/livestocks/birth/birth.functions'

export function registerBirthEditDeleteHandler() {
  registerEditDeleteHandler('BIRTH_EDIT_DELETE', {
    edit: birthFunctions.editBirthRegistration,
    delete: birthFunctions.deleteBirthRegistration,
  })
}
