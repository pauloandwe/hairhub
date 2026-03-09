import { sendWhatsAppMessage, sendWhatsAppMessageWithTitle } from '../../../api/meta.api'
import { sendAgeGroupSelectionList } from '../../../interactives/ageCategorySelection'
import { sendDeathCauseSelectionList } from '../../../interactives/deathCauseSelection'
import { sendLocationSelectionList } from '../../../interactives/locationSelection'
import { DeathField } from '../../../enums/cruds/deathFields.enums'
import { appendAssistantTextAuto } from '../../../services/history-router.service'
import { DeathFields, DeathValidationDraft } from '../../../services/livestocks/death-draft.service'
import { ChangeResponse, FieldEditor } from '../../functions.types'
import { getMenuSentCopy } from '../../../utils/conversation-copy'

type DeathEditField = `${DeathField.Quantity}` | `${DeathField.DeathDate}` | `${DeathField.Age}` | `${DeathField.Category}` | `${DeathField.DeathCause}` | `${DeathField.AnimalLot}` | `${DeathField.Retreat}` | `${DeathField.Area}`

export const respond = (message: string, interactive: boolean): ChangeResponse => ({
  message,
  interactive,
})

const editQuantity: FieldEditor = async (phone) => {
  await sendWhatsAppMessage(phone, 'Qual a nova quantidade? (mínimo 1) 🐄')
  return respond('Quantidade solicitada', false)
}

const editAgeOrCategory: FieldEditor = async (phone) => {
  await sendAgeGroupSelectionList(phone, 'Me diz a idade ou categoria.')
  return respond(getMenuSentCopy('idade e categoria'), true)
}

const editDeathCause: FieldEditor = async (phone) => {
  await sendDeathCauseSelectionList(phone, 'Qual foi a causa?')
  return respond(getMenuSentCopy('causas'), true)
}

const editAnimalLot: FieldEditor = async (phone) => {
  await sendLocationSelectionList(phone, 'Em qual localizacao foi isso?')
  return respond(getMenuSentCopy('localizacoes'), true)
}

const editDeathDate: FieldEditor = async (phone) => {
  await sendWhatsAppMessage(phone, 'Qual a nova data? 📆')
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
  const message = 'Quantos animais morreram? (mínimo 1) 🐄'

  await appendAssistantTextAuto(phone, message)
  await sendWhatsAppMessageWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askAgeCategory: MissingFieldHandler = async (phone, draft) => {
  await sendAgeGroupSelectionList(phone, 'Me diz a idade ou categoria.')
  return { message: getMenuSentCopy('idade e categoria'), interactive: true, draft }
}

const askDeathCause: MissingFieldHandler = async (phone, draft) => {
  await sendDeathCauseSelectionList(phone, 'Qual foi a causa?')
  return { message: getMenuSentCopy('causas'), interactive: true, draft }
}

const askAnimalLot: MissingFieldHandler = async (phone, draft) => {
  await sendLocationSelectionList(phone, 'Em qual localizacao foi isso?')
  return {
    message: getMenuSentCopy('localizacoes'),
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
