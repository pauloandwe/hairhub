import { sendWhatsAppMessageWithTitle } from '../../../api/meta.api'
import { BirthField } from '../../../enums/cruds/birthFields.enum'
import { sendBirthCategoriesList } from '../../../interactives/birth/birthCategorySelection'
import { sendBirthLocationSelectionList } from '../../../interactives/locationSelection'
import { appendAssistantTextAuto } from '../../../services/history-router.service'
import { IBirthValidationDraft } from '../../../services/livestocks/Birth/birth.types'
import { FieldEditor } from '../../functions.types'

export type BirthEditField = `${BirthField.BirthDate}` | `${BirthField.Quantity}` | `${BirthField.Category}` | `${BirthField.Retreat}` | `${BirthField.Area}`
export type BirthMissingField = `${BirthField.BirthDate}` | `${BirthField.Quantity}` | `${BirthField.Category}` | `${BirthField.Retreat}` | `${BirthField.Area}`

type ChangeResponse = { message: string; interactive: boolean }

const respond = (message: string, interactive: boolean): ChangeResponse => ({
  message,
  interactive,
})

const askWithTitle = async (phone: string, message: string): Promise<void> => {
  await appendAssistantTextAuto(phone, message)
  await sendWhatsAppMessageWithTitle(phone, message)
}

const editBirthDate: FieldEditor = async (phone) => {
  const message = 'Qual foi a data do nascimento? 📆'
  await askWithTitle(phone, message)
  return respond('Data solicitada', false)
}

const editQuantity: FieldEditor = async (phone) => {
  const message = 'Quantos animais nasceram? (mínimo 1) 🐄'
  await askWithTitle(phone, message)
  return respond('Quantidade solicitada', false)
}

const editCategory: FieldEditor = async (phone) => {
  await sendBirthCategoriesList(phone, 'Qual a nova categoria? 👇')
  return respond('Menu de categorias enviado', true)
}

const editRetreat: FieldEditor = async (phone) => {
  await sendBirthLocationSelectionList(phone, 'Qual o novo retiro? 👇')
  return respond('Menu de localizações enviado', true)
}

const editArea: FieldEditor = async (phone) => {
  await sendBirthLocationSelectionList(phone, 'Qual a nova área? 👇')
  return respond('Menu de localizações enviado', true)
}

export const birthFieldEditors: Record<BirthEditField, FieldEditor> = {
  [BirthField.BirthDate]: editBirthDate,
  [BirthField.Quantity]: editQuantity,
  [BirthField.Category]: editCategory,
  [BirthField.Retreat]: editRetreat,
  [BirthField.Area]: editArea,
}

type MissingFieldHandler = (phone: string, draft: IBirthValidationDraft) => Promise<{ message: string; interactive: boolean; draft: IBirthValidationDraft }>

const askBirthDate: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual foi a data do nascimento? 📆'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askQuantity: MissingFieldHandler = async (phone, draft) => {
  const message = 'Quantos animais nasceram? (mínimo 1) 🐄'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askCategory: MissingFieldHandler = async (phone, draft) => {
  await sendBirthCategoriesList(phone, 'Qual a categoria? 👇')
  return { message: 'Menu de categorias enviado', interactive: true, draft }
}

const askRetreatAndArea: MissingFieldHandler = async (phone, draft) => {
  await sendBirthLocationSelectionList(phone, 'Qual a localização? 👇')
  return {
    message: 'Menu de localizações enviado',
    interactive: true,
    draft,
  }
}

export const missingFieldHandlers: Record<BirthMissingField, MissingFieldHandler> = {
  [BirthField.BirthDate]: askBirthDate,
  [BirthField.Quantity]: askQuantity,
  [BirthField.Category]: askCategory,
  [BirthField.Retreat]: askRetreatAndArea,
  [BirthField.Area]: askRetreatAndArea,
}
