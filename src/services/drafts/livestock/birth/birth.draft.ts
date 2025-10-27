import { IBirthValidationDraft } from '../../../livestocks/Birth/birth.types'

export function emptyBirthDraft(): IBirthValidationDraft {
  return {
    birthDate: null,
    quantity: null,
    gender: { id: null, name: null },
    category: { id: null, name: null },
    farmId: null,
    retreat: { id: null, name: null },
    area: { id: null, name: null },
    harvestConfiguration: { id: null, name: null },
    status: 'collecting',
  }
}
