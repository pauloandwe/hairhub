import { sendWhatsAppMessageWithTitle } from '../../../api/meta.api'
import { sendPurchaseLocationSelectionList } from '../../../interactives/locationSelection'
import { sendPurchaseCategoriesList } from '../../../interactives/purchase/purchaseCategorySelection'
import { appendAssistantTextAuto } from '../../../services/history-router.service'
import { IPurchaseValidationDraft, PurchaseEditField, PurchaseField, PurchaseMissingField } from '../../../services/livestocks/Purchase/purchase.types'
import { FieldEditor } from '../../functions.types'

type ChangeResponse = { message: string; interactive: boolean }

type MissingFieldHandler = (phone: string, draft: IPurchaseValidationDraft) => Promise<{ message: string; interactive: boolean; draft: IPurchaseValidationDraft }>

const respond = (message: string, interactive: boolean): ChangeResponse => ({
  message,
  interactive,
})

const askWithTitle = async (phone: string, message: string): Promise<void> => {
  await appendAssistantTextAuto(phone, message)
  await sendWhatsAppMessageWithTitle(phone, message)
}

const editSaleDate: FieldEditor = async (phone) => {
  const message = 'Tranquilo, só me passar a nova data que eu já faço a alteração. 📆'
  await askWithTitle(phone, message)
  return respond('Data solicitada', false)
}

const editWeight: FieldEditor = async (phone) => {
  const message = 'Qual é o novo peso por cabeça? (em kg)'
  await askWithTitle(phone, message)
  return respond(message, false)
}

const editQuantity: FieldEditor = async (phone) => {
  const message = 'Beleza, qual é a quantidade nova? (mínimo 1)'
  await askWithTitle(phone, message)
  return respond('Quantidade solicitada', false)
}

const editUnityValue: FieldEditor = async (phone) => {
  const message = 'Pra qual valor unitário vamos trocar? (somente o número)'
  await askWithTitle(phone, message)
  return respond('Valor unitário solicitado', false)
}

const editTotalValue: FieldEditor = async (phone) => {
  const message = 'Tranquilo, me passa o novo valor total da compra (somente o número).'
  await askWithTitle(phone, message)
  return respond('Valor total solicitado', false)
}

const editCategory: FieldEditor = async (phone) => {
  await sendPurchaseCategoriesList(phone)
  return { message: 'Menu de categorias enviado', interactive: true }
}

const editRetreatOrArea: FieldEditor = async (phone) => {
  await sendPurchaseLocationSelectionList(phone, 'Selecione a nova localidade para trocar')
  return {
    message: 'Menu de localizações enviado',
    interactive: true,
  }
}

const editObservation: FieldEditor = async (phone) => {
  const message = 'Qual é a nova observação para esta compra?'
  await askWithTitle(phone, message)
  return respond('Observação solicitada', false)
}

const askSaleDate: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual foi a data de compra? 📆'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askWeight: MissingFieldHandler = async (phone, draft) => {
  const message = 'Perfeito, agora me diga, qual é o peso por cabeça? (em kg)'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askQuantity: MissingFieldHandler = async (phone, draft) => {
  const message = 'Me informa agora a quantidade de animais que foram comprados, por gentileza. (somente o número)'
  await askWithTitle(phone, message)
  return { message: 'Quantidade solicitada', interactive: false, draft }
}

const askUnityValue: MissingFieldHandler = async (phone, draft) => {
  const message = 'Me passa certinho o valor unitário da compra (somente o número).'
  await askWithTitle(phone, message)
  return { message: 'Valor unitário solicitado', interactive: false, draft }
}

const askTotalValue: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual é o valor total da compra? (somente o número).'
  await askWithTitle(phone, message)
  return { message: 'Valor total solicitado', interactive: false, draft }
}

const askCategory: MissingFieldHandler = async (phone, draft) => {
  await sendPurchaseCategoriesList(phone)
  return { message: 'Menu de categorias enviado', interactive: true, draft }
}

const askRetreatAndArea: MissingFieldHandler = async (phone, draft) => {
  await sendPurchaseLocationSelectionList(phone)
  return {
    message: 'Menu de localizações enviado',
    interactive: true,
    draft,
  }
}

const askObservation: MissingFieldHandler = async (phone, draft) => {
  await editObservation(phone)
  return { message: 'Observação solicitada', interactive: false, draft }
}

export const missingFieldHandlers: Record<PurchaseMissingField, MissingFieldHandler> = {
  [PurchaseField.SaleDate]: askSaleDate,
  [PurchaseField.Weight]: askWeight,
  [PurchaseField.Quantity]: askQuantity,
  [PurchaseField.UnityValue]: askUnityValue,
  [PurchaseField.TotalValue]: askTotalValue,
  [PurchaseField.Category]: askCategory,
  [PurchaseField.Retreat]: askRetreatAndArea,
  [PurchaseField.Area]: askRetreatAndArea,
  [PurchaseField.Observation]: askObservation,
}

export const purchaseFieldEditors: Record<PurchaseEditField, FieldEditor> = {
  [PurchaseField.SaleDate]: editSaleDate,
  [PurchaseField.Weight]: editWeight,
  [PurchaseField.Quantity]: editQuantity,
  [PurchaseField.UnityValue]: editUnityValue,
  [PurchaseField.TotalValue]: editTotalValue,
  [PurchaseField.Category]: editCategory,
  [PurchaseField.Retreat]: editRetreatOrArea,
  [PurchaseField.Area]: editRetreatOrArea,
  [PurchaseField.Observation]: editObservation,
}
