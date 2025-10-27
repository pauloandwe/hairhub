import { OpenAITool } from '../types/openai-types'
import { deathCauseTools } from './livestocks/deathCause.tools'
import { locationSelectionTools } from './livestocks/locationSelection.tools'
import { ageCategoryTools } from './livestocks/ageCategory.tools'
import { deathTools } from './livestocks/death.tools'
import { InstitutionType } from '../enums/institutions.enum'
import { expenseTools } from './finances/simplifiedExpense.tools'
import { simplifiedExpenseSelectionTools } from './finances/simplifiedExpenseSelection.tools'
import { unsupportedRegistrationTools } from './utils/unsupportedRegistration.tools'
import { unsupportedQueryTools } from './utils/unsupportedQuery.tools'
import { appointmentTools } from './appointments/appointment.tools'
import { appointmentQueryTools } from './appointments/appointment-queries.tools'

export const allTools: OpenAITool[] = [...appointmentTools, ...appointmentQueryTools, ...unsupportedRegistrationTools, ...unsupportedQueryTools]

export const interactiveTools: OpenAITool[] = [...ageCategoryTools, ...locationSelectionTools, ...deathCauseTools, ...simplifiedExpenseSelectionTools]

function filterToolsByFunctionName(tools: OpenAITool[], functionName: string): OpenAITool[] {
  return tools.filter((t) => t.type === 'function' && t.function.name === functionName)
}

export const editTools: OpenAITool[] = [...filterToolsByFunctionName(deathTools, 'editDeathRecordField'), ...filterToolsByFunctionName(expenseTools, 'editExpenseRecordField')]

export function getToolsForPhone(phone: string): OpenAITool[] {
  return allTools
}
