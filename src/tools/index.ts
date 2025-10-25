import { appointmentFlowTools } from './appointments/create/appointmentFlow.tools'
import { appointmentQueriesTools } from './appointments/appointment-queries.tools'
import { dateTools } from './utils/date.tools'
import { unsupportedRegistrationTools } from './utils/unsupportedRegistration.tools'
import { unsupportedQueryTools } from './utils/unsupportedQuery.tools'

export const allTools = [...appointmentFlowTools, ...appointmentQueriesTools, ...dateTools, ...unsupportedRegistrationTools, ...unsupportedQueryTools]
