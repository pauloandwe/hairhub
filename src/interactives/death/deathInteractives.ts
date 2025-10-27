import { registerEditDeleteHandler } from '../editDeleteHandler'
import { deathFunctions } from '../../functions/livestocks/death/death.functions'

export function registerDeathEditDeleteHandler() {
  registerEditDeleteHandler('DEATH_EDIT_DELETE', {
    edit: deathFunctions.editAnimalDeathRegistration,
    delete: deathFunctions.deleteAnimalDeathRegistration,
  })
}
