import { SimplifiedExpenseValidationDraft } from '../../finances/simplifiedExpense/simplified-expense.types'

export function emptyExpenseDraft(): SimplifiedExpenseValidationDraft {
  return {
    value: null,
    supplier: { id: null, name: null },
    description: null,
    paymentMethod: { id: null, name: null },
    emissionDate: null,
    dueDate: null,
    paymentDate: null,
    businessArea: { id: null, name: null },
    status: 'collecting',
    recordId: undefined,
  }
}
