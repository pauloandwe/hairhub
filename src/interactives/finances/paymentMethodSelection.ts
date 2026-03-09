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
import { getSelectionAck } from '../../utils/conversation-copy'

export const PAYMENT_METHOD_NAMESPACE = 'PAYMENT_METHOD'

const paymentMethodFlow = createSelectionFlow<SelectionItem>({
  namespace: PAYMENT_METHOD_NAMESPACE,
  type: 'selectPaymentMethod',
  fetchItems: async (phone) => {
    return simplifiedExpenseService.listPaymentMethods(phone)
  },
  ui: {
    header: 'Escolha o metodo de pagamento',
    sectionTitle: 'Métodos de pagamento',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Qual forma de pagamento voce quer usar?',
  invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
  emptyListMessage: 'Nao encontrei formas de pagamento por aqui.',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Escolher essa forma de pagamento',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)

    await setUserContext(userId, {
      paymentMethodId: item.id,
      paymentMethodName: item.name,
    })

    if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.SimplifiedExpense) {
      await simplifiedExpenseService.updateDraftField(userId, SimplifiedExpenseField.PaymentMethod, { id: item.id, name: item.name })
    }
    await sendWhatsAppMessage(userId, getSelectionAck('generic', item.name))
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

export async function sendPaymentMethodList(userId: string, bodyMsg = 'Qual forma de pagamento voce quer usar?', offset = 0) {
  await paymentMethodFlow.sendList(userId, bodyMsg, offset)
}
