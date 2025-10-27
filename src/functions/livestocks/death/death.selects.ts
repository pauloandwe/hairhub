import { sendWhatsAppMessage, sendWhatsAppMessageWithTitle } from '../../../api/meta.api'
import { sendAgeGroupSelectionList } from '../../../interactives/ageCategorySelection'
import { sendDeathCauseSelectionList } from '../../../interactives/deathCauseSelection'
import { sendLocationSelectionList } from '../../../interactives/locationSelection'
import { DeathField } from '../../../enums/cruds/deathFields.enums'
import { appendAssistantTextAuto } from '../../../services/history-router.service'
import { DeathFields, DeathValidationDraft } from '../../../services/livestocks/death-draft.service'
import { ChangeResponse, FieldEditor } from '../../functions.types'

type DeathEditField = `${DeathField.Quantity}` | `${DeathField.DeathDate}` | `${DeathField.Age}` | `${DeathField.Category}` | `${DeathField.DeathCause}` | `${DeathField.AnimalLot}` | `${DeathField.Retreat}` | `${DeathField.Area}`

export const respond = (message: string, interactive: boolean): ChangeResponse => ({
  message,
  interactive,
})

const editQuantity: FieldEditor = async (phone) => {
  await sendWhatsAppMessage(phone, 'Qual a nova quantidade? (só o número)')
  return respond('Quantidade solicitada', false)
}

const editAgeOrCategory: FieldEditor = async (phone) => {
  await sendAgeGroupSelectionList(phone, 'Qual a idade/categoria? 👇')
  return respond('Menu enviado', true)
}

const editDeathCause: FieldEditor = async (phone) => {
  await sendDeathCauseSelectionList(phone, 'Qual a causa da morte? 👇')
  return respond('Menu enviado', true)
}

const editAnimalLot: FieldEditor = async (phone) => {
  await sendLocationSelectionList(phone, 'Qual a localização? 👇')
  return respond('Menu enviado', true)
}

const editDeathDate: FieldEditor = async (phone) => {
  await sendWhatsAppMessage(phone, 'Qual a nova data? (formato YYYY-MM-DD)')
  return respond('Data solicitada', false)
}

export const deathFieldEditors: Record<DeathEditField, FieldEditor> = {
  [DeathField.Quantity]: editQuantity,
  [DeathField.DeathDate]: editDeathDate,
  [DeathField.AnimalLot]: editAnimalLot,
  [DeathField.Retreat]: editAnimalLot,
  [DeathField.Area]: editAnimalLot,
  [DeathField.Age]: editAgeOrCategory,
  [DeathField.Category]: editAgeOrCategory,
  [DeathField.DeathCause]: editDeathCause,
}

type MissingFieldHandler = (
  phone: string,
  draft: DeathValidationDraft,
) => Promise<{
  message: string
  interactive: boolean
  draft: DeathValidationDraft
}>

const askQuantity: MissingFieldHandler = async (phone, draft) => {
  const message = 'Quantos animais morreram? (só o número)'

  await appendAssistantTextAuto(phone, message)
  await sendWhatsAppMessageWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askAgeCategory: MissingFieldHandler = async (phone, draft) => {
  await sendAgeGroupSelectionList(phone, 'Qual a idade/categoria? 👇')
  return { message: 'Menu enviado', interactive: true, draft }
}

const askDeathCause: MissingFieldHandler = async (phone, draft) => {
  await sendDeathCauseSelectionList(phone, 'Qual a causa da morte? 👇')
  return { message: 'Menu enviado', interactive: true, draft }
}

const askAnimalLot: MissingFieldHandler = async (phone, draft) => {
  await sendLocationSelectionList(phone, 'Qual a localização? 👇')
  return {
    message: 'Menu enviado',
    interactive: true,
    draft,
  }
}

export const missingFieldHandlers: Record<DeathFields, MissingFieldHandler> = {
  [DeathField.Quantity]: askQuantity,
  [DeathField.Retreat]: askAnimalLot,
  [DeathField.Area]: askAnimalLot,
  [DeathField.Age]: askAgeCategory,
  [DeathField.Category]: askAgeCategory,
  [DeathField.DeathCause]: askDeathCause,
}
