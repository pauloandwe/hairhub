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

export const SUPPLIER_NAMESPACE = 'SUPPLIER_GROUP'

const supplierFlow = createSelectionFlow<SelectionItem>({
  namespace: SUPPLIER_NAMESPACE,
  type: 'selectSupplier',
  fetchItems: async (phone) => {
    return simplifiedExpenseService.listSuppliers(phone)
  },
  ui: {
    header: 'Escolha o Fornecedor',
    sectionTitle: 'Fornecedores',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Antes de continuar, selecione fornecedor desejado.',
  invalidSelectionMsg: 'Seleção inválida ou expirada. Reenviando a lista.',
  emptyListMessage: 'Nenhum fornecedor encontrado',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Selecionar este fornecedor',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)

    await setUserContext(userId, {
      supplierId: item.id,
      supplierName: item.name,
    })

    if (getUserContextSync(userId)?.activeRegistration?.type === FlowType.SimplifiedExpense) {
      await simplifiedExpenseService.updateDraftField(userId, SimplifiedExpenseField.Supplier, { id: item.id, name: item.name })
    }
    await sendWhatsAppMessage(userId, `Fornecedor '${item.name}' selecionado.`)
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    const updates: Partial<UpsertSimplifiedExpenseArgs> = {
      [SimplifiedExpenseField.Supplier]: { id: item.id, name: item.name },
    }

    await simplifiedExpenseFunctions.applyExpenseRecordUpdates({
      phone: userId,
      updates,
      logContext: `Fornecedor atualizado para ${item.name}`,
    })
  },
})

export async function sendSupplierSelectionList(userId: string, bodyMsg = 'Antes de continuar, selecione o fornecedor.', offset = 0) {
  await supplierFlow.sendList(userId, bodyMsg, offset)
}
