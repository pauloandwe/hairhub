import { appointmentTools } from './appointments/appointment.tools'
import { appointmentQueriesTools } from './appointments/appointment-queries.tools'
import { dateTools } from './utils/date.tools'
import { unsupportedRegistrationTools } from './utils/unsupportedRegistration.tools'
import { unsupportedQueryTools } from './utils/unsupportedQuery.tools'

export const allTools = [
  ...appointmentTools,
  ...appointmentQueriesTools,
  ...dateTools,
  ...unsupportedRegistrationTools,
  ...unsupportedQueryTools,
]
