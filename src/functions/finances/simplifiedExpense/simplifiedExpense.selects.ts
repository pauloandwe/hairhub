import { sendWhatsAppMessage, sendWhatsAppMessageWithTitle } from '../../../api/meta.api'
import { sendBusinessAreaSelectionList } from '../../../interactives/finances/businessAreaSelection'
import { sendPaymentMethodList } from '../../../interactives/finances/paymentMethodSelection'
import { sendSupplierSelectionList } from '../../../interactives/finances/supplierSelection'
import { promptCostCenterSearch, sendCostCenterSelectionList } from '../../../interactives/finances/costCenterSelection'
import { SimplifiedExpenseField } from '../../../enums/cruds/simplifiedExpenseFields.enums'
import { CostCenterSuggestion, SimplifiedExpenseFields, SimplifiedExpenseRequiredFields } from '../../../services/finances/simplifiedExpense/simplified-expense.types'
import { SelectionItem } from '../../../services/generic/generic.types'
import { appendAssistantTextAuto } from '../../../services/history-router.service'
import { FieldEditor } from '../../functions.types'
import { respond } from '../../livestocks/death/death.selects'
import { MissingFieldHandler } from './simplifiedExpenseSelects.types'

const askEmissionDate: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual a data de emissão? 📆'

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

const buildCostCenterHierarchyDescription = (suggestion: CostCenterSuggestion): string | undefined => {
  const hierarchy = [suggestion.original_class?.name, suggestion.original_cost_center?.name, suggestion.original_sub_cost_center?.name].map((part) => part?.trim()).filter((part): part is string => Boolean(part))

  if (hierarchy.length === 0) return undefined

  return hierarchy.join(' -> ')
}

const mapCostCenterSuggestionToSelectionItem = (suggestion: CostCenterSuggestion): SelectionItem | null => {
  if (suggestion.cost_center_id == null) return null

  const name = suggestion.cost_center?.name?.trim() || 'Sem Classe'
  const description = buildCostCenterHierarchyDescription(suggestion)

  const selectionItem: SelectionItem = {
    id: String(suggestion.cost_center_id),
    name,
  }

  if (description) selectionItem.description = description

  return selectionItem
}

const askCostCenter: MissingFieldHandler = async (phone, draft) => {
  if (draft.costCenterSuggestions && draft.costCenterSuggestions.length > 0) {
    const suggestedItems: SelectionItem[] = draft.costCenterSuggestions.map(mapCostCenterSuggestionToSelectionItem).filter((item): item is SelectionItem => item !== null)

    if (suggestedItems.length > 0) {
      await sendCostCenterSelectionList(phone, 'Selecione o centro de custo mais adequado:', 0, suggestedItems)
      return { message: 'Enviei sugestões de centro de custo.', interactive: true, draft }
    }
  }

  await promptCostCenterSearch(phone, true)
  return { message: 'Enviei o menu de centros de custo.', interactive: true, draft }
}

export const missingFieldHandlers: Record<SimplifiedExpenseRequiredFields | 'costCenter', MissingFieldHandler> = {
  [SimplifiedExpenseField.EmissionDate]: askEmissionDate,
  [SimplifiedExpenseField.Supplier]: askSupplier,
  [SimplifiedExpenseField.Value]: askExpenseValue,
  [SimplifiedExpenseField.BusinessArea]: askBusinessArea,
  [SimplifiedExpenseField.CostCenter]: askCostCenter,
}

const editEmissionDate: FieldEditor = async (phone) => {
  await sendWhatsAppMessage(phone, 'Certo! Qual a data de emissão? 📆')
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
  await sendWhatsAppMessage(phone, 'Certo! Qual a data de vencimento? 📆')
  return respond('Solicitei a data de vencimento.', false)
}

const editPaymentDate: FieldEditor = async (phone) => {
  const message = 'Qual é a data de pagamento? 📆'

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

const editProductServiceName: FieldEditor = async (phone) => {
  await sendWhatsAppMessageWithTitle(phone, 'Certo! Qual o nome do produto ou serviço?')
  return respond('Solicitei o nome do produto ou serviço.', false)
}

const editCostCenter: FieldEditor = async (phone) => {
  await promptCostCenterSearch(phone)
  return respond('Enviei o menu de centros de custo.', true)
}

export const simplifiedExpenseEditors: Record<SimplifiedExpenseFields | 'costCenter', FieldEditor> = {
  [SimplifiedExpenseField.EmissionDate]: editEmissionDate,
  [SimplifiedExpenseField.Supplier]: editSupplier,
  [SimplifiedExpenseField.Value]: editExpenseValue,
  [SimplifiedExpenseField.Description]: editDescription,
  [SimplifiedExpenseField.DueDate]: editDueDate,
  [SimplifiedExpenseField.PaymentDate]: editPaymentDate,
  [SimplifiedExpenseField.PaymentMethod]: editPaymentMethod,
  [SimplifiedExpenseField.BusinessArea]: editBusinessArea,
  [SimplifiedExpenseField.ProductServiceName]: editProductServiceName,
  [SimplifiedExpenseField.CostCenter]: editCostCenter,
}
