import { sendWhatsAppMessage, sendWhatsAppMessageWithTitle } from '../../../api/meta.api'
import { sendBusinessAreaSelectionList } from '../../../interactives/finances/businessAreaSelection'
import { sendPaymentMethodList } from '../../../interactives/finances/paymentMethodSelection'
import { sendSupplierSelectionList } from '../../../interactives/finances/supplierSelection'
import { SimplifiedExpenseField } from '../../../enums/cruds/simplifiedExpenseFields.enums'
import { SimplifiedExpenseFields, SimplifiedExpenseRequiredFields } from '../../../services/finances/simplifiedExpense/simplified-expense.types'
import { appendAssistantTextAuto } from '../../../services/history-router.service'
import { FieldEditor } from '../../functions.types'
import { respond } from '../../livestocks/death/death.selects'
import { MissingFieldHandler } from './simplifiedExpenseSelects.types'

const askEmissionDate: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual a data de emissão? Informe a data no formato dd/mm/aaaa.'

  await appendAssistantTextAuto(phone, message)
  await sendWhatsAppMessageWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askSupplier: MissingFieldHandler = async (phone, draft) => {
  await sendSupplierSelectionList(phone, 'Selecione o fornecedor.')
  return { message: 'Enviei o menu de fornecedores.', interactive: true, draft }
}

const askExpenseValue: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual é o valor da despesa? (apenas o número).'

  await appendAssistantTextAuto(phone, message)
  await sendWhatsAppMessageWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askBusinessArea: MissingFieldHandler = async (phone, draft) => {
  await sendBusinessAreaSelectionList(phone, 'Selecione a área de negócios.')
  return { message: 'Enviei o menu de áreas de negócios.', interactive: true, draft }
}

export const missingFieldHandlers: Record<SimplifiedExpenseRequiredFields, MissingFieldHandler> = {
  [SimplifiedExpenseField.EmissionDate]: askEmissionDate,
  [SimplifiedExpenseField.Supplier]: askSupplier,
  [SimplifiedExpenseField.Value]: askExpenseValue,
  [SimplifiedExpenseField.BusinessArea]: askBusinessArea,
}

const editEmissionDate: FieldEditor = async (phone) => {
  await sendWhatsAppMessage(phone, 'Certo! Qual a data de emissão? (informe no formato dd/mm/aaaa).')
  return respond('Solicitei a data de emissão.', false)
}

const editSupplier: FieldEditor = async (phone) => {
  await sendSupplierSelectionList(phone, 'Selecione o fornecedor.')
  return respond('Enviei o menu de fornecedores.', true)
}

const editExpenseValue: FieldEditor = async (phone) => {
  await sendWhatsAppMessage(phone, 'Certo! Qual o valor da despesa? (apenas o número).')
  return respond('Solicitei o valor da despesa.', false)
}

const editDescription: FieldEditor = async (phone) => {
  await sendWhatsAppMessageWithTitle(phone, 'Certo! Qual a descrição da despesa?')
  return respond('Enviei o menu de descrições.', true)
}

const editDueDate: FieldEditor = async (phone) => {
  await sendWhatsAppMessage(phone, 'Certo! Qual a data de vencimento? (informe no formato dd/mm/aaaa).')
  return respond('Solicitei a data de vencimento.', false)
}

const editPaymentDate: FieldEditor = async (phone) => {
  const message = 'Qual é a data de pagamento? (informe no formato dd/mm/aaaa).'

  await appendAssistantTextAuto(phone, message)
  await sendWhatsAppMessageWithTitle(phone, message)
  return respond(message, false)
}

const editPaymentMethod: FieldEditor = async (phone) => {
  await sendPaymentMethodList(phone, 'Selecione o método de pagamento.')
  return respond('Enviei o menu de métodos de pagamento.', true)
}

const editBusinessArea: FieldEditor = async (phone) => {
  await sendBusinessAreaSelectionList(phone, 'Selecione a área de negócios.')
  return respond('Enviei o menu de áreas de negócios.', true)
}

export const simplifiedExpenseEditors: Record<SimplifiedExpenseFields, FieldEditor> = {
  [SimplifiedExpenseField.EmissionDate]: editEmissionDate,
  [SimplifiedExpenseField.Supplier]: editSupplier,
  [SimplifiedExpenseField.Value]: editExpenseValue,
  [SimplifiedExpenseField.Description]: editDescription,
  [SimplifiedExpenseField.DueDate]: editDueDate,
  [SimplifiedExpenseField.PaymentDate]: editPaymentDate,
  [SimplifiedExpenseField.PaymentMethod]: editPaymentMethod,
  [SimplifiedExpenseField.BusinessArea]: editBusinessArea,
}
