import { registerEditDeleteHandler } from '../editDeleteHandler'
import { simplifiedExpenseFunctions } from '../../functions/finances/simplifiedExpense/simplifiedExpense.functions'

export function registerSimplifiedExpenseEditDeleteHandler() {
  registerEditDeleteHandler('SIMPLIFIED_EXPENSE_EDIT_DELETE', {
    edit: simplifiedExpenseFunctions.editSimplifiedExpenseRegistration,
    delete: simplifiedExpenseFunctions.deleteSimplifiedExpenseRegistration,
  })
}
