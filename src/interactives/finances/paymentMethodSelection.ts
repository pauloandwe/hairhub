import { sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { SimplifiedExpenseField } from '../../enums/cruds/simplifiedExpenseFields.enums'
import { getUserContext, setUserContext, getUserContextSync } from '../../env.config'
import { simplifiedExpenseService } from '../../services/finances/simplifiedExpense/simplifiedExpenseService'
import { UpsertSimplifiedExpenseArgs } from '../../services/finances/simplifiedExpense/simplified-expense.types'
import { simplifiedExpenseFunctions } from '../../functions/finances/simplifiedExpense/simplifiedExpense.functions'
import { SelectionItem } from '../../services/generic/generic.types'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'

export const PAYMENT_METHOD_NAMESPACE = 'PAYMENT_METHOD'

const paymentMethodFlow = createSelectionFlow<SelectionItem>({
  namespace: PAYMENT_METHOD_NAMESPACE,
  type: 'selectPaymentMethod',
  fetchItems: async (phone) => {
    return simplifiedExpenseService.listPaymentMethods(phone)
  },
  ui: {
    header: 'Escolha o método de pagamento',
    sectionTitle: 'Métodos de pagamento',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Antes de continuar, selecione o método de pagamento desejado.',
  invalidSelectionMsg: 'Seleção inválida ou expirada. Reenviando a lista.',
  emptyListMessage: 'Nenhuma forma de pagamento encontrada',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Selecionar este método de pagamento',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)

    await setUserContext(userId, {
      paymentMethodId: item.id,
      paymentMethodName: item.name,
    })

    if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.SimplifiedExpense) {
      await simplifiedExpenseService.updateDraftField(userId, SimplifiedExpenseField.PaymentMethod, { id: item.id, name: item.name })
    }
    await sendWhatsAppMessage(userId, `Método de pagamento '${item.name}' selecionado.`)
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    const updates: Partial<UpsertSimplifiedExpenseArgs> = {
      [SimplifiedExpenseField.PaymentMethod]: { id: item.id, name: item.name },
    }

    await simplifiedExpenseFunctions.applyExpenseRecordUpdates({
      phone: userId,
      updates,
      logContext: `Método de pagamento atualizado para ${item.name}`,
    })
  },
})

export async function sendPaymentMethodList(userId: string, bodyMsg = 'Antes de continuar, selecione o método de pagamento.', offset = 0) {
  await paymentMethodFlow.sendList(userId, bodyMsg, offset)
}
