import { SimplifiedExpenseValidationDraft } from '../../../services/finances/simplifiedExpense/simplified-expense.types'

export type MissingFieldHandler = (
  phone: string,
  draft: SimplifiedExpenseValidationDraft,
) => Promise<{
  message: string
  interactive: boolean
  draft: SimplifiedExpenseValidationDraft
}>
